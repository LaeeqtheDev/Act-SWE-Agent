import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { eventQueue } from "./queue.js";
import { investigateIncident, performAction } from "./agent.js";
import { getProvider, OPENAI_COMPATIBLE_PRESETS, ANTHROPIC_MODELS, isPremiumModel } from "./providers/index.js";
import { createConversation, listConversations, getConversationMessages, sendMessage, renameConversation, deleteConversation, deleteEmptyConversations } from "./chat.js";
import { getProviderSettings, saveProviderSettings } from "./settings.js";
import { getUsage } from "./usage.js";
import { createCheckoutSession, handleStripeWebhook, submitReceipt, listPendingPayments, reviewPendingPayment, listAllPayments, getPayment, getBankDetails, createPortalSession, cancelSubscription, listUsers, setUserPlan, listMyPayments } from "./billing.js";
import { checkDemoRateLimit, runDemoChat, type DemoTurn } from "./demo.js";
import { listAgentIncidents, resolveAgentIncident } from "./agent-incidents.js";
import { initScheduler, listWorkflows, createWorkflow, updateWorkflow, deleteWorkflow, listWorkflowRuns, runWorkflowNow } from "./workflows.js";
import { listNotifications, unreadCount, markRead, markAllRead } from "./notifications.js";
import { metricsMiddleware, renderMetrics, metricsContentType } from "./metrics.js";
import { getProgress } from "./progress.js";
import { buildAuthUrl, handleCallback, listConnections, disconnect, type Service } from "./connections.js";
import { storeUploadedFile, getReceiptFile } from "./storage.js";
import { exportTrainingDataJsonl, countEligibleConversations } from "./fine-tuning.js";
import { getUserProfile, saveUserProfile } from "./profile.js";

const app = express();

// A single unhandled rejection anywhere (a fire-and-forget call missing a
// .catch, a library throwing async) can otherwise take down the entire
// server — which is exactly the kind of crash that looks like "the API
// just stopped responding" from the frontend's point of view. Log it
// loudly instead of dying silently; the actual bug still needs fixing, but
// the server staying up to serve the next request is strictly better than
// it going dark.
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandled promise rejection (server staying up):", reason);
});
const prisma = new PrismaClient();
const PORT = 4000;

// Standard security headers (HSTS, no-sniff, frame protection). One line,
// and it closes a whole category of trivial issues.
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// `cors()` with no arguments allows EVERY origin — meaning any website a
// user visits could call this API with their credentials. In production
// only the configured frontend is allowed. Self-hosting keeps the open
// default, since there's no cross-origin risk on your own machine.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors(
    allowedOrigins.length > 0
      ? {
          origin: (origin, cb) => {
            // Same-origin and server-to-server requests have no Origin header.
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
            cb(new Error("Not allowed by CORS"));
          },
          credentials: true,
        }
      : undefined
  )
);

if (allowedOrigins.length === 0 && process.env.NODE_ENV === "production") {
  console.warn(
    "[security] ALLOWED_ORIGINS is not set in production — the API is accepting requests from any origin. " +
      'Set ALLOWED_ORIGINS="https://yourdomain.com" before exposing this publicly.'
  );
}

// A per-user usage limit is checked per TASK, which does nothing to stop
// someone firing hundreds of requests a minute. This caps request RATE,
// which is what actually protects the provider bill and the database.
const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.CHAT_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — slow down for a moment." },
});

const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.WRITE_RATE_LIMIT) || 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — slow down for a moment." },
});

// Stripe's webhook needs the RAW request body to verify its signature —
// registered here, before the global JSON parser below, or the body would
// already be consumed/parsed by the time it reaches this handler and
// signature verification would fail every time.
app.post("/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    return res.status(400).json({ error: "missing stripe-signature header" });
  }
  try {
    const result = await handleStripeWebhook(req.body, signature);
    res.json(result);
  } catch (err) {
    console.error("[billing] webhook failed:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "webhook verification failed" });
  }
});

app.use(express.json({ limit: "256kb" }));
app.use(metricsMiddleware);

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", metricsContentType);
  res.send(await renderMetrics());
});

// --- Hosted mode / auth ---
// Self-hosted (default, HOSTED_MODE unset): no auth at all, no accounts, no
// limits — the whole point of the open-source core. Hosted mode adds Clerk
// on top, WITHOUT changing anything about how self-hosting works: the two
// paths are fully separate, gated by one env var, checked once here.
const HOSTED_MODE = process.env.HOSTED_MODE === "true";

if (HOSTED_MODE) {
  const { clerkMiddleware } = await import("@clerk/express");
  app.use(clerkMiddleware());
}

// Resolves the current user's id when hosted + signed in; undefined
// otherwise (self-hosted, or hosted but not authenticated on a route that
// allows it). Routes that actually require a signed-in user in hosted mode
// use requireUser() below instead.
async function currentUserId(req: express.Request): Promise<string | undefined> {
  if (!HOSTED_MODE) return undefined;
  const { getAuth } = await import("@clerk/express");
  return getAuth(req).userId ?? undefined;
}

// For the routes that actually consume a "task" (chat send, investigate):
// in hosted mode, a signed-in user is required — anonymous requests are
// rejected before they ever reach the AI provider or get metered. In
// self-hosted mode this always just returns undefined and lets the request
// through, matching the "no accounts, no limits" promise.
async function requireUserIfHosted(req: express.Request, res: express.Response): Promise<string | undefined> {
  if (!HOSTED_MODE) return undefined;
  const userId = await currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in required." });
    return undefined;
  }
  return userId;
}

app.get("/ai/status", async (req, res) => {
  const userId = await currentUserId(req);
  const provider = await getProvider(userId);
  res.json(
    provider
      ? { configured: true, provider: provider.name, model: provider.model }
      : { configured: false }
  );
});

app.get("/usage", async (req, res) => {
  if (!HOSTED_MODE) return res.json({ hosted: false });
  const userId = await currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Sign in required." });
  res.json({ hosted: true, ...(await getUsage(userId)) });
});

// --- Billing (Phase 5) ---
// All hosted-mode-only. Self-hosted deployments never touch any of this.

app.post("/billing/checkout", writeLimiter, async (req, res) => {
  if (!HOSTED_MODE) return res.status(400).json({ error: "Billing only applies in hosted mode." });
  const userId = await currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Sign in required." });
  try {
    const { successUrl, cancelUrl, email } = req.body ?? {};
    const result = await createCheckoutSession(
      userId,
      email,
      successUrl || `${req.headers.origin || ""}/agent?upgraded=true`,
      cancelUrl || `${req.headers.origin || ""}/agent`
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "checkout failed" });
  }
});

const receiptUpload = multer({
  dest: (() => {
    const dir = "uploads/receipts/";
    fs.mkdirSync(dir, { recursive: true }); // multer needs this to already exist
    return dir;
  })(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(png|jpe?g|pdf|webp)$/i.test(file.originalname);
    if (!ok) return cb(new Error("Only PNG, JPG, WEBP, or PDF receipts are accepted"));
    cb(null, true);
  },
});

app.post("/billing/bank-transfer", receiptUpload.single("receipt"), async (req, res) => {
  if (!HOSTED_MODE) return res.status(400).json({ error: "Billing only applies in hosted mode." });
  const userId = await currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Sign in required." });
  if (!req.file) return res.status(400).json({ error: "No receipt file uploaded." });
  try {
    const storageKey = await storeUploadedFile(req.file.path, req.file.originalname);
    const payment = await submitReceipt(userId, storageKey, req.file.originalname, req.body?.amount, req.body?.note);
    res.json({ submitted: true, id: payment.id, status: payment.status });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "upload failed" });
  }
});

// Manual review queue for bank-transfer receipts — protected by a shared
// admin secret (not a full role system) since this is a single-operator
// review flow, not a multi-admin dashboard. Set ADMIN_SECRET in apps/api/.env
// and pass it as `x-admin-secret` header.
function requireAdmin(req: express.Request, res: express.Response): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    res.status(503).json({ error: "ADMIN_SECRET is not configured." });
    return false;
  }
  if (req.headers["x-admin-secret"] !== secret) {
    res.status(401).json({ error: "Invalid admin secret." });
    return false;
  }
  return true;
}

// A user checking their own bank-transfer status. Without this they submit
// a receipt and have no idea whether it's been seen.
app.get("/billing/my-payments", async (req, res) => {
  if (!HOSTED_MODE) return res.json([]);
  const userId = await currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Sign in required." });
  res.json(await listMyPayments(userId));
});

app.get("/billing/pending", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await listPendingPayments());
});

app.get("/billing/payments", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await listAllPayments());
});

app.post("/billing/pending/:id/:decision", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const decision = req.params.decision;
  if (decision !== "approved" && decision !== "rejected") {
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
  }
  const payment = await reviewPendingPayment(req.params.id, decision);
  res.json(payment);
});

// Streams the actual uploaded receipt file so an admin can look at it before
// approving — admin-secret gated, same as the rest of the review endpoints.
app.get("/billing/receipts/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const payment = await getPayment(req.params.id);
  if (!payment) return res.status(404).json({ error: "not found" });
  try {
    const { buffer, contentType } = await getReceiptFile(payment.receiptPath);
    if (contentType) res.set("Content-Type", contentType);
    res.send(buffer);
  } catch (err) {
    res.status(404).json({ error: "receipt file not found on storage" });
  }
});

// Real bank account details for wiring a transfer — configured entirely via
// env vars (see billing.ts), never hardcoded. Returns null/hidden fields
// until you actually set them.
app.get("/billing/bank-details", (req, res) => {
  res.json(getBankDetails() ?? { configured: false });
});

// Stripe's hosted "manage my subscription" page — cancel, update card,
// view invoices, all without any UI I'd have to build myself.
app.post("/billing/portal", async (req, res) => {
  if (!HOSTED_MODE) return res.status(400).json({ error: "Billing only applies in hosted mode." });
  const userId = await currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Sign in required." });
  try {
    const { returnUrl } = req.body ?? {};
    const result = await createPortalSession(userId, returnUrl || `${req.headers.origin || ""}/billing`);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "portal session failed" });
  }
});

app.post("/billing/cancel", async (req, res) => {
  if (!HOSTED_MODE) return res.status(400).json({ error: "Billing only applies in hosted mode." });
  const userId = await currentUserId(req);
  if (!userId) return res.status(401).json({ error: "Sign in required." });
  try {
    const result = await cancelSubscription(userId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "cancellation failed" });
  }
});

// --- Admin: full user list + manual plan override ---
// The blunt tool for "just make this account Pro" — independent of Stripe
// or a receipt, for comps or fixing a mistake by hand.

app.get("/admin/users", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json(await listUsers());
});

app.post("/admin/users/:id/plan", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const plan = req.body?.plan;
  if (plan !== "free" && plan !== "pro") return res.status(400).json({ error: "plan must be 'free' or 'pro'" });
  res.json(await setUserPlan(req.params.id, plan));
});

// Exports your own real conversation history as fine-tuning-ready JSONL —
// not a fine-tuning pipeline itself, see fine-tuning.ts for exactly what
// this does and doesn't do. Admin-only since conversation content can be
// sensitive.
app.get("/admin/export-training-data", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const minMessages = Number(req.query.minMessages) || 4;
  const jsonl = await exportTrainingDataJsonl(minMessages);
  res.set("Content-Type", "application/jsonl");
  res.set("Content-Disposition", `attachment; filename="training-data-${Date.now()}.jsonl"`);
  res.send(jsonl);
});

app.get("/admin/export-training-data/count", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const minMessages = Number(req.query.minMessages) || 4;
  res.json({ eligibleConversations: await countEligibleConversations(minMessages) });
});

// --- Settings: model provider + BYOK, entered from the UI ---
// GET returns only a masked key preview, never the real one. POST accepts a
// plaintext key over HTTPS in the request body (same trust boundary as
// entering it into any settings form) and stores it encrypted — see settings.ts.
// Scoped per-user in hosted mode (see settings.ts) so one person's key is
// never used for anyone else's chats; a single shared row in self-host mode.

app.get("/settings/provider", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  const settings = await getProviderSettings(userId);
  // Whether the server itself already has a working provider key from env.
  // When true, a signed-in user doesn't need to supply anything — the app
  // just works, and their own key becomes an optional override rather than
  // a requirement.
  const serverProvider = await getProvider();
  res.json({
    settings,
    serverDefault: serverProvider ? { provider: serverProvider.name, model: serverProvider.model } : null,
    catalog: {
      anthropic: { models: ANTHROPIC_MODELS },
      ...Object.fromEntries(Object.entries(OPENAI_COMPATIBLE_PRESETS).map(([k, v]) => [k, { models: v.models }])),
    },
  });
});

app.post("/settings/provider", writeLimiter, async (req, res) => {
  const { provider, model, apiKey } = req.body ?? {};
  if (!provider || !model) return res.status(400).json({ error: "provider and model are required" });
  try {
    const userId = await requireUserIfHosted(req, res);
    if (HOSTED_MODE && !userId) return;

    // Phase 6: free hosted accounts can't select a premium model unless
    // they're providing their own key (BYOK bypasses this — they're paying
    // for their own tokens either way, so the limit doesn't apply). Self-host
    // never hits this at all (userId is always undefined there).
    if (HOSTED_MODE && userId && isPremiumModel(model) && !apiKey) {
      const usage = await getUsage(userId);
      if (usage.plan !== "pro") {
        return res.status(403).json({
          error: `${model} is a Pro-tier model. Upgrade to Pro, or paste your own API key to use any model regardless of plan.`,
        });
      }
    }

    await saveProviderSettings({ provider, model, apiKey, userId });
    const settings = await getProviderSettings(userId);
    res.json({ saved: true, settings });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "failed to save settings" });
  }
});


// --- Landing page demo widget ---
// No auth, rate-limited per IP, read-only tools only. See demo.ts for why.
app.post("/demo/chat", async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const { allowed, remaining } = checkDemoRateLimit(ip);
  if (!allowed) {
    return res.status(429).json({
      error: "Demo limit reached for now — sign up for the full agent, or self-host it with your own key.",
      remaining: 0,
    });
  }

  const history = (req.body?.history as DemoTurn[]) ?? [];
  if (history.length > 12) history.splice(0, history.length - 12); // keep it small regardless of what the client sends

  try {
    const result = await runDemoChat(history);
    res.json({ ...result, remaining });
  } catch (err) {
    console.error("[demo] chat failed:", err);
    res.status(500).json({ error: "The demo hit an error — try again in a moment." });
  }
});

// --- Real, live agent self-monitoring ---
// Separate from the simulated /incidents (payments-api, orders-api, etc.,
// kept as a demo of the detection pipeline) — these are genuine failures
// the agent hit while actually doing something, during a real chat or
// investigation session.
app.get("/agent-incidents", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  res.json(await listAgentIncidents(req.query.status as string | undefined));
});

app.post("/agent-incidents/:id/resolve", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  res.json(await resolveAgentIncident(req.params.id));
});

// --- Workflows: tasks that repeat on a schedule, unattended ---
// Same tools, same permission gate on writes as a real chat — a schedule
// triggers it instead of a person typing. In hosted mode these require a
// signed-in user and are scoped to them; self-host has one shared list.

app.get("/workflows", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  res.json(await listWorkflows(userId));
});

app.post("/workflows", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  const { name, prompt, cron, notifyOnRun, stages } = req.body ?? {};
  if (!name || !prompt || !cron) return res.status(400).json({ error: "name, prompt, and cron are required" });
  try {
    const workflow = await createWorkflow({
      name,
      prompt,
      cron,
      stages: Array.isArray(stages) ? stages.filter((s: unknown) => typeof s === "string" && s.trim()) : undefined,
      notifyOnRun,
      userId,
    });
    res.json(workflow);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "failed to create workflow" });
  }
});

app.patch("/workflows/:id", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  const { name, prompt, cron, enabled, notifyOnRun, stages } = req.body ?? {};
  const workflow = await updateWorkflow(String(req.params.id), { name, prompt, cron, enabled, notifyOnRun, stages });
  res.json(workflow);
});

app.delete("/workflows/:id", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  await deleteWorkflow(req.params.id);
  res.json({ deleted: true });
});

app.post("/workflows/:id/run", chatLimiter, async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  runWorkflowNow(String(req.params.id)).catch((err) => console.error("[workflows] manual run failed:", err));
  res.json({ started: true });
});

app.get("/workflows/:id/runs", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  res.json(await listWorkflowRuns(req.params.id));
});

// --- Notifications ---

app.get("/notifications", async (req, res) => {
  const userId = await currentUserId(req);
  res.json({ notifications: await listNotifications(userId), unread: await unreadCount(userId) });
});

app.post("/notifications/:id/read", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  res.json(await markRead(req.params.id));
});

app.post("/notifications/read-all", async (req, res) => {
  const userId = await currentUserId(req);
  await markAllRead(userId);
  res.json({ ok: true });
});

// --- User profile: saved details used to auto-fill forms ---
// Job applications, contact forms, signups — the agent reads this via the
// getUserProfile tool so the user never retypes the same information.

app.get("/profile", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  res.json((await getUserProfile(userId)) ?? {});
});

app.post("/profile", writeLimiter, async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  const saved = await saveUserProfile(req.body ?? {}, userId);
  res.json({ saved: true, profile: saved });
});

// Reports which optional subsystems are actually active. Useful for
// answering "I set HOSTED_MODE=true, why is there still no login?" — if
// this says hosted is false, the API never picked up the env change
// (usually: the server wasn't restarted).
app.get("/config", (req, res) => {
  res.json({
    // Surfaced to the UI so it can tell the user WHY email and LinkedIn
    // tasks aren't working, instead of those tasks just failing silently.
    chromeProfileConnected: !!process.env.CHROME_USER_DATA_DIR,
    hostedMode: HOSTED_MODE,
    clerkConfigured: !!process.env.CLERK_SECRET_KEY && !!process.env.CLERK_PUBLISHABLE_KEY,
    stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
    bankTransferConfigured: !!getBankDetails(),
    smtpConfigured: !!process.env.SMTP_HOST,
    browserVisible: process.env.BROWSER_HEADLESS === "false",
    localDevTools: process.env.ENABLE_LOCAL_DEV_TOOLS === "true",
    chromeProfile: !!process.env.CHROME_USER_DATA_DIR,
  });
});

// Polled by the chat UI while a task is running, so the user sees "Opening
// a page" instead of a static spinner.
app.get("/chat/conversations/:id/progress", async (req, res) => {
  res.json(getProgress(String(req.params.id)) ?? { step: 0, activity: null });
});

// --- Integrations (Slack, Notion) ---

app.get("/connections", async (req, res) => {
  const userId = await currentUserId(req);
  res.json(await listConnections(userId));
});

// Redirects to the provider's consent screen. Signed state carries the user
// id, so the callback knows who authorised without needing a session there.
app.get("/connections/:service/start", async (req, res) => {
  const service = String(req.params.service) as Service;
  if (service !== "slack" && service !== "notion") return res.status(400).json({ error: "Unknown service." });
  try {
    const userId = await currentUserId(req);
    res.redirect(buildAuthUrl(service, userId));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Couldn't start the connection." });
  }
});

app.get("/connections/:service/callback", async (req, res) => {
  const service = String(req.params.service) as Service;
  const web = process.env.PUBLIC_WEB_URL || "http://localhost:3000";
  try {
    const { workspaceName } = await handleCallback(service, String(req.query.code ?? ""), String(req.query.state ?? ""));
    // Back to the app rather than leaving the user on a JSON blob.
    res.redirect(`${web}/settings/connections?connected=${service}&workspace=${encodeURIComponent(workspaceName)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed.";
    res.redirect(`${web}/settings/connections?error=${encodeURIComponent(message)}`);
  }
});

app.post("/connections/:service/disconnect", writeLimiter, async (req, res) => {
  const service = String(req.params.service) as Service;
  const userId = await currentUserId(req);
  await disconnect(service, userId);
  res.json({ disconnected: true });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/services", async (req, res) => {
  const services = await prisma.service.findMany();
  res.json(services);
});

app.get("/incidents", async (req, res) => {
  const incidents = await prisma.incident.findMany({
    orderBy: { createdAt: "desc" },
  });
  res.json(incidents);
});

app.get("/incidents/:id/events", async (req, res) => {
  const events = await prisma.incidentEvent.findMany({
    where: { incidentId: req.params.id },
    orderBy: { timestamp: "asc" },
  });
  res.json(events);
});

// --- Simulator ---

app.post("/simulate/database-overload", async (req, res) => {
  const { serviceName = "payments-api" } = req.body ?? {};

  const service = await prisma.service.findFirst({ where: { name: serviceName } });
  if (!service) {
    return res.status(404).json({ error: `Service '${serviceName}' not found` });
  }

  const rawEvents = [
    { type: "deployment", message: "Deployment v43 started" },
    { type: "db_connections", message: "Database connections +38%" },
    { type: "latency", message: `${service.name} latency +210%` },
    { type: "error_rate", message: "5xx rate exceeds threshold" },
  ];

  // Push each event onto the queue instead of writing directly to the DB.
  // A separate worker process picks these up and processes them.
  for (const e of rawEvents) {
    await eventQueue.add("service-event", {
      serviceId: service.id,
      serviceName: service.name,
      type: e.type,
      message: e.message,
    });
  }

  res.json({ queued: rawEvents.length, serviceId: service.id });
});

app.post("/simulate/pod-crash-loop", async (req, res) => {
  const { serviceName = "auth-api" } = req.body ?? {};

  const service = await prisma.service.findFirst({ where: { name: serviceName } });
  if (!service) {
    return res.status(404).json({ error: `Service '${serviceName}' not found` });
  }

  const rawEvents = [
    { type: "pod_restart", message: `${service.name} pod entered CrashLoopBackOff` },
    { type: "pod_restart", message: `${service.name} pod restarted (attempt 2)` },
    { type: "pod_restart", message: `${service.name} pod restarted (attempt 3)` },
  ];

  for (const e of rawEvents) {
    await prisma.event.create({
      data: { serviceId: service.id, type: e.type, message: e.message },
    });
  }

  await prisma.service.update({ where: { id: service.id }, data: { status: "degraded" } });

  const recentRestarts = await prisma.event.count({
    where: {
      serviceId: service.id,
      type: "pod_restart",
      timestamp: { gte: new Date(Date.now() - 60_000) },
    },
  });

  let incident = null;
  if (recentRestarts >= 3) {
    incident = await prisma.incident.create({
      data: {
        serviceId: service.id,
        title: "Pod crash loop",
        severity: "medium",
        status: "investigating",
      },
    });

    await prisma.incidentEvent.createMany({
      data: rawEvents.map((e) => ({ incidentId: incident!.id, message: e.message })),
    });
  }

  res.json({ triggeredEvents: rawEvents.length, incidentCreated: !!incident, incident });
});

app.post("/incidents/:id/resolve", async (req, res) => {
  const incident = await prisma.incident.update({
    where: { id: req.params.id },
    data: { status: "resolved", resolvedAt: new Date() },
  });

  await prisma.service.update({
    where: { id: incident.serviceId },
    data: { status: "healthy" },
  });

  await prisma.incidentEvent.create({
    data: { incidentId: incident.id, message: "Incident marked resolved" },
  });

  res.json(incident);
});

// --- Sprint 7: AI Agent ---
// Read-only investigation. Calls out to Anthropic with a fixed tool menu
// (DB + best-effort Kubernetes), then stores the structured result as an
// AgentAction of type "investigation" so it's visible in the incident's history.

app.post("/incidents/:id/investigate", chatLimiter, async (req, res) => {
  try {
    const userId = await requireUserIfHosted(req, res);
    if (HOSTED_MODE && !userId) return; // response already sent (401)

    const result = await investigateIncident(String(req.params.id), userId);

    const action = await prisma.agentAction.create({
      data: {
        incidentId: req.params.id,
        type: "investigation",
        status: "completed",
        summary: result.summary,
        confidence: result.confidence,
        evidence: { probableCause: result.probableCause, evidence: result.evidence, recommendedAction: result.recommendedAction },
        resolvedAt: new Date(),
      },
    });

    await prisma.incidentEvent.create({
      data: { incidentId: req.params.id, message: `AI investigation: ${result.probableCause}` },
    });

    res.json({ ...result, actionId: action.id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "investigation failed" });
  }
});

app.get("/incidents/:id/actions", async (req, res) => {
  const actions = await prisma.agentAction.findMany({
    where: { incidentId: req.params.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(actions);
});

// Global feed of agent activity — every proposed/completed action across
// every incident and every chat conversation, not scoped to one incident.
// This is what makes the dashboard show what the AGENT has actually been
// doing, instead of only the simulator's synthetic service blips.
app.get("/actions", async (req, res) => {
  const status = req.query.status as string | undefined;
  const actions = await prisma.agentAction.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { incident: { include: { service: true } } },
  });
  res.json(actions);
});

// --- Sprint 8: Permission layer ---
// The agent can only *propose* a write action (rollback, restart_pod, scale).
// Nothing executes until a human explicitly approves it here — this is the
// "AI Agent -> Permission Layer -> read ✓ / write ? approval" gate from the plan.

app.post("/incidents/:id/actions", async (req, res) => {
  const { type = "restart_pod", summary, browserPayload } = req.body ?? {};
  const action = await prisma.agentAction.create({
    data: {
      incidentId: req.params.id,
      type,
      status: "pending",
      summary: summary ?? `Proposed action: ${type}`,
      evidence: browserPayload ? { payload: browserPayload } : undefined,
    },
  });
  res.json(action);
});

// Lets the chat confirm whether an action was already decided, so an
// approved action doesn't render live buttons again after a reload.
app.get("/actions/:id", async (req, res) => {
  const action = await prisma.agentAction.findUnique({
    where: { id: String(req.params.id) },
    select: { id: true, status: true, type: true, summary: true },
  });
  if (!action) return res.status(404).json({ error: "action not found" });
  res.json(action);
});

app.post("/actions/:id/approve", writeLimiter, async (req, res) => {
  try {
    await prisma.agentAction.update({ where: { id: req.params.id }, data: { status: "approved" } });
    const result = await performAction(String(req.params.id));
    res.json({ approved: true, result });
  } catch (err) {
    console.error("[actions] approve failed:", err);
    res.status(400).json({ error: err instanceof Error ? err.message : "approval failed" });
  }
});

app.post("/actions/:id/reject", async (req, res) => {
  const action = await prisma.agentAction.update({
    where: { id: req.params.id },
    data: { status: "rejected", resolvedAt: new Date() },
  });
  res.json(action);
});

// --- Chat (multi-turn conversational agent) ---
// In hosted mode, every route here requires a signed-in user, and every
// operation is scoped to that user's own conversations — chat.ts's
// assertOwnership() throws if a signed-in user ever tries to touch a
// conversation that isn't theirs (returned below as 404, not 403, so
// existence of someone else's conversation id is never confirmed/denied).

app.post("/chat/conversations", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  const conversation = await createConversation(req.body?.title, userId);
  res.json(conversation);
});

app.get("/chat/conversations", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  res.json(await listConversations(userId));
});

app.get("/chat/conversations/:id/messages", async (req, res) => {
  try {
    const userId = await requireUserIfHosted(req, res);
    if (HOSTED_MODE && !userId) return;
    res.json(await getConversationMessages(req.params.id, userId));
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "conversation not found" });
  }
});

app.post("/chat/conversations/:id/messages", chatLimiter, async (req, res) => {
  try {
    const userId = await requireUserIfHosted(req, res);
    if (HOSTED_MODE && !userId) return; // response already sent (401)

    // When the user hits Stop, the browser aborts the request — but without
    // this the server happily kept running the whole agent loop, burning
    // tokens and a task quota on work nobody was waiting for.
    const cancelled = new AbortController();
    req.on("close", () => {
      // A real AbortController, not a flag — this actually aborts the
      // in-flight model call rather than letting it finish and discarding
      // the result.
      if (!res.writableEnded) cancelled.abort();
    });

    const result = await sendMessage(String(req.params.id), req.body?.message ?? "", userId, cancelled);
    if (cancelled.signal.aborted) return; // client is gone; nothing to respond to
    res.json(result);
  } catch (err) {
    console.error("[chat] sendMessage failed:", err);
    const notFound = err instanceof Error && err.message === "conversation not found";
    res.status(notFound ? 404 : 500).json({ error: err instanceof Error ? err.message : "chat failed" });
  }
});

app.patch("/chat/conversations/:id", async (req, res) => {
  try {
    const userId = await requireUserIfHosted(req, res);
    if (HOSTED_MODE && !userId) return;
    const conversation = await renameConversation(req.params.id, req.body?.title ?? "", userId);
    res.json(conversation);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "conversation not found" });
  }
});

app.delete("/chat/conversations/:id", async (req, res) => {
  try {
    const userId = await requireUserIfHosted(req, res);
    if (HOSTED_MODE && !userId) return;
    await deleteConversation(req.params.id, userId);
    res.json({ deleted: true });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "conversation not found" });
  }
});

app.delete("/chat/conversations", async (req, res) => {
  const userId = await requireUserIfHosted(req, res);
  if (HOSTED_MODE && !userId) return;
  const result = await deleteEmptyConversations(userId);
  res.json(result);
});

// Global error handler — must be registered LAST, after every route. Any
// error thrown or rejected inside an async route handler ends up here —
// Express 5 forwards async errors to error middleware natively, no patch
// package needed (unlike Express 4). This is what turns "the request never
// got a response" (which shows up as "Failed to fetch" in the browser) into
// a real, visible 500 with an actual message — e.g. a schema drift like
// `prisma.workflow` not existing yet because a migration hasn't been run.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[error] ${req.method} ${req.path}:`, err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const server = app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);

  // Print the settings that people most often expect to be on but aren't,
  // because .env is copied once and then drifts from .env.example.
  const visible = process.env.BROWSER_HEADLESS === "false";
  const profile = !!process.env.CHROME_USER_DATA_DIR;
  console.log(
    `[browser] visible window: ${visible ? "ON" : "OFF (set BROWSER_HEADLESS=\"false\" to watch it work)"} | ` +
      `your Chrome profile: ${profile ? "ON" : "OFF (set CHROME_USER_DATA_DIR for logged-in sites + fewer CAPTCHAs)"}`
  );
  initScheduler().catch((err) => console.error("[workflows] scheduler init failed:", err));
});

// Graceful shutdown. ECS sends SIGTERM before killing a task; without
// handling it we leak Chromium processes and drop in-flight requests
// mid-response on every single deploy.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — closing browsers and connections`);

  // Stop accepting new connections, let in-flight requests finish.
  server.close();

  const { closeAllSessions } = await import("./tools/browser.js");
  await Promise.race([
    Promise.all([closeAllSessions(), prisma.$disconnect()]),
    // Don't hang forever if something refuses to close — the orchestrator
    // will SIGKILL us anyway, better to exit cleanly first.
    new Promise((r) => setTimeout(r, 8000)),
  ]);

  console.log("[shutdown] done");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));