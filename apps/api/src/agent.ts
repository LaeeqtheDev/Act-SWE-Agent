import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { getPodStatus, getRecentEvents as getK8sEvents, getDeploymentStatus } from "./k8s.js";

const prisma = new PrismaClient();

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// --- Tool definitions the model can call ---
// Each tool is a small, single-purpose read function. This is the important
// part conceptually: the agent doesn't get raw DB/K8s access, it gets a
// fixed menu of narrow tools, each auditable and independently gated later
// (see the permission layer for write-tools like restartDeployment).

const tools: Anthropic.Tool[] = [
  {
    name: "getServiceHealth",
    description: "Get the current status (healthy/degraded/down) of a service by name.",
    input_schema: {
      type: "object",
      properties: { serviceName: { type: "string" } },
      required: ["serviceName"],
    },
  },
  {
    name: "getRecentErrors",
    description: "Get raw telemetry events (deployments, connection spikes, latency, errors, pod restarts) for a service in the last N minutes.",
    input_schema: {
      type: "object",
      properties: {
        serviceName: { type: "string" },
        minutes: { type: "number", description: "How far back to look, default 15" },
      },
      required: ["serviceName"],
    },
  },
  {
    name: "getDeploymentHistory",
    description: "Get the incident history for a service — prior incidents and how they were resolved.",
    input_schema: {
      type: "object",
      properties: { serviceName: { type: "string" } },
      required: ["serviceName"],
    },
  },
  {
    name: "getKubernetesPodStatus",
    description: "Get live Kubernetes pod status for a service (restart count, phase, readiness), if a cluster is reachable.",
    input_schema: {
      type: "object",
      properties: { serviceName: { type: "string" } },
      required: ["serviceName"],
    },
  },
  {
    name: "getKubernetesEvents",
    description: "Get recent Kubernetes cluster events (crashes, scheduling failures) for a service, if a cluster is reachable.",
    input_schema: {
      type: "object",
      properties: { serviceName: { type: "string" } },
      required: ["serviceName"],
    },
  },
];

async function runTool(name: string, input: Record<string, unknown>) {
  const serviceName = input.serviceName as string;

  switch (name) {
    case "getServiceHealth": {
      const service = await prisma.service.findFirst({ where: { name: serviceName } });
      return service ?? { error: "service not found" };
    }
    case "getRecentErrors": {
      const minutes = (input.minutes as number) ?? 15;
      const service = await prisma.service.findFirst({ where: { name: serviceName } });
      if (!service) return { error: "service not found" };
      const events = await prisma.event.findMany({
        where: { serviceId: service.id, timestamp: { gte: new Date(Date.now() - minutes * 60_000) } },
        orderBy: { timestamp: "asc" },
      });
      return events;
    }
    case "getDeploymentHistory": {
      const service = await prisma.service.findFirst({ where: { name: serviceName } });
      if (!service) return { error: "service not found" };
      const incidents = await prisma.incident.findMany({
        where: { serviceId: service.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      return incidents;
    }
    case "getKubernetesPodStatus":
      return getPodStatus(serviceName);
    case "getKubernetesEvents":
      return getK8sEvents(serviceName);
    default:
      return { error: `unknown tool: ${name}` };
  }
}

export interface InvestigationResult {
  summary: string;
  probableCause: string;
  confidence: number;
  evidence: string[];
  recommendedAction: string;
}

const SYSTEM_PROMPT = `You are Act · SWE Agent's AI SRE agent. You investigate incidents in a small
microservices system by calling the tools available to you — never guess at data you can look up.

Investigate the incident thoroughly: check the service's health, recent raw events, deployment/incident
history, and — if a Kubernetes cluster is reachable — live pod and cluster event data.

When you are done investigating, respond with ONLY a JSON object (no markdown fences, no prose
before or after) matching this exact shape:
{
  "summary": "one paragraph explaining what happened",
  "probableCause": "one sentence, the most likely root cause",
  "confidence": 0.0 to 1.0,
  "evidence": ["short evidence bullet 1", "short evidence bullet 2", ...],
  "recommendedAction": "a short, concrete next step (e.g. 'rollback to previous deployment', 'restart pod', 'no action needed')"
}`;

export async function investigateIncident(incidentId: string): Promise<InvestigationResult> {
  if (!anthropic) {
    return {
      summary: "ANTHROPIC_API_KEY is not set, so the AI agent could not run. Set it in apps/api/.env to enable real investigations.",
      probableCause: "unknown — agent not configured",
      confidence: 0,
      evidence: [],
      recommendedAction: "Set ANTHROPIC_API_KEY and retry.",
    };
  }

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { service: true, events: { orderBy: { timestamp: "asc" } } },
  });
  if (!incident) throw new Error("incident not found");

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Investigate incident "${incident.title}" (severity: ${incident.severity}) on service "${incident.service.name}".
Known timeline so far: ${JSON.stringify(incident.events.map((e: { message: string; timestamp: Date }) => ({ message: e.message, at: e.timestamp })))}.
Use your tools to gather more evidence before concluding.`,
    },
  ];

  let finalText = "";

  // Tool-calling loop: keep going while the model wants to call tools,
  // stop once it returns a plain text (final) response.
  for (let turn = 0; turn < 6; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUses.length === 0) {
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      finalText = textBlock?.text ?? "";
      break;
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const result = await runTool(toolUse.name, toolUse.input as Record<string, unknown>);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  try {
    const cleaned = finalText.trim().replace(/^```json\s*/, "").replace(/```$/, "");
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary ?? "No summary produced.",
      probableCause: parsed.probableCause ?? "Unknown.",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
      recommendedAction: parsed.recommendedAction ?? "Review manually.",
    };
  } catch {
    return {
      summary: finalText || "The agent did not return a parsable result.",
      probableCause: "unknown — response parsing failed",
      confidence: 0,
      evidence: [],
      recommendedAction: "Review manually.",
    };
  }
}

export async function performAction(actionId: string) {
  const action = await prisma.agentAction.findUnique({ where: { id: actionId } });
  if (!action) throw new Error("action not found");
  if (action.status !== "approved") throw new Error("action is not approved");

  const incident = await prisma.incident.findUnique({
    where: { id: action.incidentId },
    include: { service: true },
  });
  if (!incident) throw new Error("incident not found");

  if (action.type === "restart_pod" || action.type === "rollback") {
    const { restartDeployment } = await import("./k8s.js");
    const result = await restartDeployment(incident.service.name);
    await prisma.agentAction.update({
      where: { id: actionId },
      data: { status: "completed", resolvedAt: new Date() },
    });
    return result;
  }

  await prisma.agentAction.update({
    where: { id: actionId },
    data: { status: "completed", resolvedAt: new Date() },
  });
  return { success: true, note: "no cluster action required for this action type" };
}
