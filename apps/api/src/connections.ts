import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt } from "./lib/crypto.js";

const prisma = new PrismaClient();

// OAuth connections to Slack and Notion. Tokens are encrypted at rest with
// the same key as provider API keys, and never returned to the frontend —
// the UI only ever learns that a connection exists and which workspace.

export type Service = "slack" | "notion";

interface ServiceConfig {
  authUrl: string;
  tokenUrl: string;
  clientId?: string;
  clientSecret?: string;
  scopes: string;
  label: string;
}

function configFor(service: Service): ServiceConfig {
  if (service === "slack") {
    return {
      authUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      clientId: process.env.SLACK_CLIENT_ID,
      clientSecret: process.env.SLACK_CLIENT_SECRET,
      // Read + write, but scoped to channels the user is actually in —
      // deliberately not requesting admin or workspace-wide scopes, which
      // are far harder to justify and much worse if the token leaks.
      scopes: "channels:history,channels:read,chat:write,groups:history,groups:read,users:read,search:read",
      label: "Slack",
    };
  }
  return {
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    clientId: process.env.NOTION_CLIENT_ID,
    clientSecret: process.env.NOTION_CLIENT_SECRET,
    // Notion has no granular scopes — access is granted per-page by the
    // user during the consent flow, which is a better model anyway.
    scopes: "",
    label: "Notion",
  };
}

export function isConfigured(service: Service): boolean {
  const cfg = configFor(service);
  return !!cfg.clientId && !!cfg.clientSecret;
}

function redirectUri(service: Service): string {
  const base = process.env.PUBLIC_API_URL || "http://localhost:4000";
  return `${base}/connections/${service}/callback`;
}

// CSRF protection. Without a state parameter an attacker can trick someone
// into connecting THEIR account to the attacker's — a real and commonly
// exploited OAuth flaw. Signed rather than stored so it survives a restart
// and works across multiple server instances.
function signState(userId: string | undefined, service: Service): string {
  const payload = JSON.stringify({ u: userId ?? "", s: service, t: Date.now() });
  const b64 = Buffer.from(payload).toString("base64url");
  const sig = crypto.createHmac("sha256", stateSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifyState(state: string, service: Service): { valid: boolean; userId?: string } {
  const [b64, sig] = state.split(".");
  if (!b64 || !sig) return { valid: false };

  const expected = crypto.createHmac("sha256", stateSecret()).update(b64).digest("base64url");
  // Constant-time compare — a plain === leaks timing information.
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false };
  }

  try {
    const { u, s, t } = JSON.parse(Buffer.from(b64, "base64url").toString());
    if (s !== service) return { valid: false };
    // 10 minutes is generous for a consent flow and limits replay.
    if (Date.now() - t > 10 * 60 * 1000) return { valid: false };
    return { valid: true, userId: u || undefined };
  } catch {
    return { valid: false };
  }
}

function stateSecret(): string {
  return process.env.SETTINGS_ENCRYPTION_KEY || process.env.DATABASE_URL || "act-fallback-state-secret";
}

export function buildAuthUrl(service: Service, userId?: string): string {
  const cfg = configFor(service);
  if (!cfg.clientId) throw new Error(`${cfg.label} isn't configured — set ${service.toUpperCase()}_CLIENT_ID.`);

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(service),
    response_type: "code",
    state: signState(userId, service),
  });
  if (cfg.scopes) params.set("scope", cfg.scopes);
  if (service === "notion") params.set("owner", "user");

  return `${cfg.authUrl}?${params.toString()}`;
}

export async function handleCallback(service: Service, code: string, state: string): Promise<{ workspaceName: string }> {
  const check = verifyState(state, service);
  if (!check.valid) throw new Error("Invalid or expired authorization request. Start the connection again.");

  const cfg = configFor(service);
  if (!cfg.clientId || !cfg.clientSecret) throw new Error(`${cfg.label} isn't configured.`);

  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri(service),
    grant_type: "authorization_code",
  });

  // Slack accepts credentials in the body; Notion requires Basic auth.
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (service === "notion") {
    headers.Authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`;
  } else {
    body.set("client_id", cfg.clientId);
    body.set("client_secret", cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: "POST", headers, body });
  const data = (await res.json()) as Record<string, unknown>;

  // Slack returns HTTP 200 with { ok: false } on failure, so checking
  // res.ok alone would silently store a broken connection.
  if (service === "slack" && data.ok === false) {
    throw new Error(`Slack rejected the connection: ${data.error ?? "unknown error"}`);
  }
  if (!res.ok) throw new Error(`${cfg.label} rejected the connection.`);

  const accessToken =
    service === "slack"
      ? ((data.access_token as string) ?? ((data.authed_user as Record<string, string>)?.access_token))
      : (data.access_token as string);

  if (!accessToken) throw new Error(`${cfg.label} didn't return an access token.`);

  const workspaceName =
    service === "slack"
      ? ((data.team as Record<string, string>)?.name ?? "Slack workspace")
      : ((data.workspace_name as string) ?? "Notion workspace");

  const userId = check.userId;
  await prisma.connection.upsert({
    where: { userId_service: { userId: userId ?? null, service } },
    create: {
      userId,
      service,
      accessToken: encrypt(accessToken),
      refreshToken: data.refresh_token ? encrypt(data.refresh_token as string) : null,
      workspaceName,
      scopes: cfg.scopes || null,
    },
    update: {
      accessToken: encrypt(accessToken),
      refreshToken: data.refresh_token ? encrypt(data.refresh_token as string) : null,
      workspaceName,
    },
  });

  return { workspaceName };
}

// Server-side only. Never expose this over HTTP.
export async function getToken(service: Service, userId?: string): Promise<string | null> {
  const conn = await prisma.connection.findUnique({
    where: { userId_service: { userId: userId ?? null, service } },
  });
  if (!conn) return null;
  try {
    return decrypt(conn.accessToken);
  } catch {
    // Encryption key changed — the token is unreadable, so treat it as
    // disconnected rather than throwing on every tool call.
    return null;
  }
}

export async function listConnections(userId?: string) {
  const rows = await prisma.connection.findMany({
    where: { userId: userId ?? null },
    select: { service: true, workspaceName: true, createdAt: true },
  });
  return {
    connected: rows,
    available: (["slack", "notion"] as Service[])
      .filter((s) => isConfigured(s))
      .map((s) => ({ service: s, label: configFor(s).label })),
  };
}

export async function disconnect(service: Service, userId?: string): Promise<void> {
  await prisma.connection
    .delete({ where: { userId_service: { userId: userId ?? null, service } } })
    .catch(() => {});
}
