import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { eventQueue } from "./queue.js";
import { investigateIncident, performAction } from "./agent.js";
import { getProvider, OPENAI_COMPATIBLE_PRESETS, ANTHROPIC_MODELS, isPremiumModel } from "./providers/index.js";
import { createConversation, listConversations, getConversationMessages, sendMessage, renameConversation, deleteConversation, deleteEmptyConversations } from "./chat.js";
import { getProviderSettings, saveProviderSettings } from "./settings.js";
import { getUsage } from "./usage.js";
import { createCheckoutSession, handleStripeWebhook, submitReceipt, listPendingPayments, reviewPendingPayment, listAllPayments, getPayment, getBankDetails, createPortalSession, listUsers, setUserPlan } from "./billing.js";

const app = express();
const prisma = new PrismaClient();
const PORT = 4000;

app.use(cors());

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

app.use(express.json());

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

app.post("/billing/checkout", async (req, res) => {
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
    const payment = await submitReceipt(
      userId,
      req.file.path,
      req.file.originalname,
      req.body?.amount,
      req.body?.note
    );
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
  res.sendFile(path.resolve(payment.receiptPath));
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

// --- Settings: model provider + BYOK, entered from the UI ---
// GET returns only a masked key preview, never the real one. POST accepts a
// plaintext key over HTTPS in the request body (same trust boundary as
// entering it into any settings form) and stores it encrypted — see settings.ts.
// Scoped per-user in hosted mode (see settings.ts) so one person's key is
// never used for anyone else's chats; a single shared row in self-host mode.

app.get("/settings/provider", async (req, res) => {
  const userId = await currentUserId(req);
  const settings = await getProviderSettings(userId);
  res.json({
    settings,
    catalog: {
      anthropic: { models: ANTHROPIC_MODELS },
      ...Object.fromEntries(Object.entries(OPENAI_COMPATIBLE_PRESETS).map(([k, v]) => [k, { models: v.models }])),
    },
  });
});

app.post("/settings/provider", async (req, res) => {
  const { provider, model, apiKey } = req.body ?? {};
  if (!provider || !model) return res.status(400).json({ error: "provider and model are required" });
  try {
    const userId = await currentUserId(req);

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

app.post("/incidents/:id/investigate", async (req, res) => {
  try {
    const userId = await requireUserIfHosted(req, res);
    if (HOSTED_MODE && !userId) return; // response already sent (401)

    const result = await investigateIncident(req.params.id, userId);

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

app.post("/actions/:id/approve", async (req, res) => {
  try {
    await prisma.agentAction.update({ where: { id: req.params.id }, data: { status: "approved" } });
    const result = await performAction(req.params.id);
    res.json({ approved: true, result });
  } catch (err) {
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

app.post("/chat/conversations/:id/messages", async (req, res) => {
  try {
    const userId = await requireUserIfHosted(req, res);
    if (HOSTED_MODE && !userId) return; // response already sent (401)

    const result = await sendMessage(req.params.id, req.body?.message ?? "", userId);
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

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});