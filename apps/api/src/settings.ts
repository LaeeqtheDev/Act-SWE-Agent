import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// API keys pasted into the settings UI are stored encrypted at rest
// (AES-256-GCM), never in plaintext, and never sent back to the frontend
// after they're saved — only a masked preview (e.g. "sk-...ab12"). Decryption
// only ever happens server-side, right before an outbound call to the
// provider. SETTINGS_ENCRYPTION_KEY must be a 32-byte value; if it's missing,
// the settings UI is simply unavailable and the app falls back to whatever
// AI_PROVIDER / *_API_KEY env vars are set — nothing breaks, it just can't
// store a key from the UI without one.

// API keys pasted into the settings UI are stored encrypted at rest
// (AES-256-GCM), never in plaintext, and never sent back to the frontend
// after they're saved — only a masked preview (e.g. "sk-...ab12"). Decryption
// only ever happens server-side, right before an outbound call to the
// provider.
//
// SETTINGS_ENCRYPTION_KEY should be set explicitly (openssl rand -hex 32) for
// any real deployment. If it's missing — e.g. quick local testing — a key is
// derived from DATABASE_URL instead so the settings UI still works rather
// than hard-failing; this is logged once so it's never silently weaker than
// you'd expect.
let warnedAboutFallbackKey = false;

function getEncryptionKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (raw) {
    return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : crypto.createHash("sha256").update(raw).digest();
  }
  if (!warnedAboutFallbackKey) {
    console.warn(
      "[settings] SETTINGS_ENCRYPTION_KEY is not set — deriving a fallback key from DATABASE_URL. " +
        "Set SETTINGS_ENCRYPTION_KEY explicitly (openssl rand -hex 32) for anything beyond local testing."
    );
    warnedAboutFallbackKey = true;
  }
  return crypto.createHash("sha256").update(`act-swe-agent-fallback:${process.env.DATABASE_URL ?? "no-db-url"}`).digest();
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

function decrypt(ciphertextB64: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(ciphertextB64, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf-8");
}

function mask(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
}

export interface ProviderSettings {
  provider: string;
  model: string;
  hasKey: boolean;
  maskedKey: string | null;
}

export async function getProviderSettings(): Promise<ProviderSettings | null> {
  const config = await prisma.providerConfig.findUnique({ where: { id: "active" } });
  if (!config) return null;
  let maskedKey: string | null = null;
  if (config.apiKeyEnc) {
    try {
      maskedKey = mask(decrypt(config.apiKeyEnc));
    } catch {
      maskedKey = "••••";
    }
  }
  return { provider: config.provider, model: config.model, hasKey: !!config.apiKeyEnc, maskedKey };
}

export async function saveProviderSettings(opts: { provider: string; model: string; apiKey?: string }) {
  const apiKeyEnc = opts.apiKey ? encrypt(opts.apiKey) : undefined;
  await prisma.providerConfig.upsert({
    where: { id: "active" },
    create: { id: "active", provider: opts.provider, model: opts.model, apiKeyEnc },
    update: { provider: opts.provider, model: opts.model, ...(apiKeyEnc ? { apiKeyEnc } : {}) },
  });
}

// Server-side only — the actual plaintext key, used right before calling the
// provider. Never exposed over HTTP.
export async function getDecryptedProviderConfig(): Promise<{ provider: string; model: string; apiKey: string | null } | null> {
  const config = await prisma.providerConfig.findUnique({ where: { id: "active" } });
  if (!config) return null;
  return {
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKeyEnc ? decrypt(config.apiKeyEnc) : null,
  };
}
