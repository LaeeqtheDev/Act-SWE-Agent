import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import { eventQueue } from "./queue.js";
import { investigateIncident, performAction } from "./agent.js";
import { getProvider, OPENAI_COMPATIBLE_PRESETS, ANTHROPIC_MODELS } from "./providers/index.js";
import { createConversation, listConversations, getConversationMessages, sendMessage, renameConversation, deleteConversation, deleteEmptyConversations } from "./chat.js";
import { getProviderSettings, saveProviderSettings } from "./settings.js";

const app = express();
const prisma = new PrismaClient();
const PORT = 4000;

app.use(cors());
app.use(express.json());

app.get("/ai/status", async (req, res) => {
  const provider = await getProvider();
  res.json(
    provider
      ? { configured: true, provider: provider.name, model: provider.model }
      : { configured: false }
  );
});

// --- Settings: model provider + BYOK, entered from the UI ---
// GET returns only a masked key preview, never the real one. POST accepts a
// plaintext key over HTTPS in the request body (same trust boundary as
// entering it into any settings form) and stores it encrypted — see settings.ts.

app.get("/settings/provider", async (req, res) => {
  const settings = await getProviderSettings();
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
    await saveProviderSettings({ provider, model, apiKey });
    const settings = await getProviderSettings();
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
    const result = await investigateIncident(req.params.id);

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

app.post("/chat/conversations", async (req, res) => {
  const conversation = await createConversation(req.body?.title);
  res.json(conversation);
});

app.get("/chat/conversations", async (req, res) => {
  res.json(await listConversations());
});

app.get("/chat/conversations/:id/messages", async (req, res) => {
  res.json(await getConversationMessages(req.params.id));
});

app.post("/chat/conversations/:id/messages", async (req, res) => {
  try {
    const result = await sendMessage(req.params.id, req.body?.message ?? "");
    res.json(result);
  } catch (err) {
    console.error("[chat] sendMessage failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "chat failed" });
  }
});

app.patch("/chat/conversations/:id", async (req, res) => {
  const conversation = await renameConversation(req.params.id, req.body?.title ?? "");
  res.json(conversation);
});

app.delete("/chat/conversations/:id", async (req, res) => {
  await deleteConversation(req.params.id);
  res.json({ deleted: true });
});

app.delete("/chat/conversations", async (req, res) => {
  const result = await deleteEmptyConversations();
  res.json(result);
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});