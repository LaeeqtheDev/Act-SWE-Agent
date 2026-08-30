import { PrismaClient } from "@prisma/client";
import { getProvider } from "./providers/index.js";
import type { AgentMessage } from "./providers/index.js";
import { getTools, runTool, compactHistoryForRequest } from "./tools/index.js";
import { restartDeployment } from "./k8s.js";
import { performBrowserAction, type BrowserActionPayload } from "./tools/browser.js";
import { performFileEdit, performShellCommand, type FileEditPayload, type ShellCommandPayload } from "./tools/devtools.js";

const prisma = new PrismaClient();

export interface InvestigationResult {
  summary: string;
  probableCause: string;
  confidence: number;
  evidence: string[];
  recommendedAction: string;
  provider?: string;
}

const SYSTEM_PROMPT = `You are Act SWE Agent — an open-source, model-agnostic AI SRE agent. You investigate
incidents in a small microservices system by calling the tools available to you — never guess at data you
can look up.

Investigate the incident thoroughly: check the service's health, recent raw events, deployment/incident
history, and — if a Kubernetes cluster is reachable — live pod and cluster event data. Use browseWeb if
checking an external status page or runbook would help. If you believe a write action (restarting a pod,
rolling back, or a browser action) would help, call proposeAction — this only requests human approval, it
never executes anything itself.

When you are done investigating, respond with ONLY a JSON object (no markdown fences, no prose before or
after) matching this exact shape:
{
  "summary": "one paragraph explaining what happened",
  "probableCause": "one sentence, the most likely root cause",
  "confidence": 0.0 to 1.0,
  "evidence": ["short evidence bullet 1", "short evidence bullet 2", ...],
  "recommendedAction": "a short, concrete next step"
}`;

export async function investigateIncident(incidentId: string): Promise<InvestigationResult> {
  const provider = await getProvider();
  if (!provider) {
    return {
      summary:
        "No AI provider is configured. Set AI_PROVIDER plus the matching API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY, GROQ_API_KEY, or nothing for a local Ollama server) in apps/api/.env to enable real investigations.",
      probableCause: "unknown — agent not configured",
      confidence: 0,
      evidence: [],
      recommendedAction: "Configure an AI provider and retry.",
    };
  }

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { service: true, events: { orderBy: { timestamp: "asc" } } },
  });
  if (!incident) throw new Error("incident not found");

  const history: AgentMessage[] = [
    {
      role: "user",
      content: `Investigate incident "${incident.title}" (severity: ${incident.severity}) on service "${incident.service.name}".
Known timeline so far: ${JSON.stringify(incident.events.map((e: { message: string; timestamp: Date }) => ({ message: e.message, at: e.timestamp })))}.
Use your tools to gather more evidence before concluding.`,
    },
  ];

  let finalText = "";

  try {
    for (let turn = 0; turn < 4; turn++) {
      const result = await provider.runTurn({ system: SYSTEM_PROMPT, tools: getTools(), history: compactHistoryForRequest(history) });

      if (result.toolCalls.length === 0) {
        finalText = result.text ?? "";
        break;
      }

      history.push({ role: "assistant", content: result.text ?? "", toolCalls: result.toolCalls });

      for (const call of result.toolCalls) {
        const output = await runTool(call.name, call.input, { incidentId });
        history.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: JSON.stringify(output) });
      }
    }
  } catch (err) {
    console.error("[agent] investigation loop failed:", err);
    return {
      summary: `The investigation failed partway through: ${err instanceof Error ? err.message : "unknown error"}`,
      probableCause: "unknown — agent error",
      confidence: 0,
      evidence: [],
      recommendedAction: "Check the API server console for the full error and retry.",
      provider: `${provider.name}/${provider.model}`,
    };
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
      provider: `${provider.name}/${provider.model}`,
    };
  } catch {
    return {
      summary: finalText || "The agent did not return a parsable result.",
      probableCause: "unknown — response parsing failed",
      confidence: 0,
      evidence: [],
      recommendedAction: "Review manually.",
      provider: `${provider.name}/${provider.model}`,
    };
  }
}

export async function performAction(actionId: string) {
  const action = await prisma.agentAction.findUnique({ where: { id: actionId } });
  if (!action) throw new Error("action not found");
  if (action.status !== "approved") throw new Error("action is not approved");

  if (action.type === "browser_action") {
    const evidence = action.evidence as { payload?: BrowserActionPayload } | null;
    if (!evidence?.payload) throw new Error("no browser action payload stored on this action");
    const result = await performBrowserAction(evidence.payload);
    await prisma.agentAction.update({ where: { id: actionId }, data: { status: "completed", resolvedAt: new Date() } });
    return result;
  }

  if (action.type === "file_edit") {
    if (process.env.ENABLE_LOCAL_DEV_TOOLS !== "true") throw new Error("local dev tools are disabled (set ENABLE_LOCAL_DEV_TOOLS=true)");
    const evidence = action.evidence as { payload?: FileEditPayload } | null;
    if (!evidence?.payload) throw new Error("no file edit payload stored on this action");
    const result = await performFileEdit(evidence.payload);
    await prisma.agentAction.update({ where: { id: actionId }, data: { status: "completed", resolvedAt: new Date() } });
    return result;
  }

  if (action.type === "shell_command") {
    if (process.env.ENABLE_LOCAL_DEV_TOOLS !== "true") throw new Error("local dev tools are disabled (set ENABLE_LOCAL_DEV_TOOLS=true)");
    const evidence = action.evidence as { payload?: ShellCommandPayload } | null;
    if (!evidence?.payload) throw new Error("no shell command payload stored on this action");
    const result = await performShellCommand(evidence.payload);
    await prisma.agentAction.update({ where: { id: actionId }, data: { status: "completed", resolvedAt: new Date() } });
    return result;
  }

  if (!action.incidentId) {
    await prisma.agentAction.update({ where: { id: actionId }, data: { status: "completed", resolvedAt: new Date() } });
    return { success: false, note: "no incident/service context attached to this action" };
  }

  const incident = await prisma.incident.findUnique({ where: { id: action.incidentId }, include: { service: true } });
  if (!incident) throw new Error("incident not found");

  if (action.type === "restart_pod" || action.type === "rollback") {
    const result = await restartDeployment(incident.service.name);
    await prisma.agentAction.update({ where: { id: actionId }, data: { status: "completed", resolvedAt: new Date() } });
    return result;
  }

  await prisma.agentAction.update({ where: { id: actionId }, data: { status: "completed", resolvedAt: new Date() } });
  return { success: true, note: "no action required for this action type" };
}
