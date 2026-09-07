import { PrismaClient } from "@prisma/client";
import { getProvider } from "./providers/index.js";
import type { AgentMessage } from "./providers/index.js";
import { getTools, runTool, compactHistoryForRequest } from "./tools/index.js";
import { restartDeployment } from "./k8s.js";
import { performBrowserAction, performFormFill, type BrowserActionPayload, type FormFillPayload } from "./tools/browser.js";
import { performFileEdit, performShellCommand, type FileEditPayload, type ShellCommandPayload } from "./tools/devtools.js";
import { checkAndIncrementUsage, UsageLimitError } from "./usage.js";
import { resumeAfterAction } from "./chat.js";
import { detectToolFailure, reportAgentIncident } from "./agent-incidents.js";
import { agentActionsTotal, toolCallsTotal } from "./metrics.js";
import { postSlackMessage, appendToNotionPage } from "./tools/integrations.js";

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
rolling back, or a browser action) would help, call proposeAction — this ONLY creates a pending approval,
it never executes anything itself. Never describe a proposed action as done; "recommendedAction" should
describe what you'd propose, not something that already happened. No emoji.

When you are done investigating, respond with ONLY a JSON object (no markdown fences, no prose before or
after) matching this exact shape:
{
  "summary": "one paragraph explaining what happened",
  "probableCause": "one sentence, the most likely root cause",
  "confidence": 0.0 to 1.0,
  "evidence": ["short evidence bullet 1", "short evidence bullet 2", ...],
  "recommendedAction": "a short, concrete next step"
}`;

export async function investigateIncident(incidentId: string, userId?: string): Promise<InvestigationResult> {
  if (userId) {
    try {
      await checkAndIncrementUsage(userId);
    } catch (err) {
      if (err instanceof UsageLimitError) {
        return {
          summary: err.message,
          probableCause: "usage limit reached",
          confidence: 0,
          evidence: [],
          recommendedAction: "Upgrade your plan or add your own API key in Settings.",
        };
      }
      throw err;
    }
  }

  const provider = await getProvider(userId);
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
    const maxTurns = Number(process.env.AGENT_MAX_TURNS) || 8;
    for (let turn = 0; turn < maxTurns; turn++) {
      const result = await provider.runTurn({ system: SYSTEM_PROMPT, tools: getTools(), history: compactHistoryForRequest(history) });

      if (result.toolCalls.length === 0) {
        finalText = result.text ?? "";
        break;
      }

      history.push({ role: "assistant", content: result.text ?? "", toolCalls: result.toolCalls });

      for (const call of result.toolCalls) {
        const output = await runTool(call.name, call.input, { incidentId, userId });
        detectToolFailure(call.name, output).catch(() => {});
        toolCallsTotal.inc({ tool: call.name, outcome: output && typeof output === "object" && "error" in output ? "error" : "success" });
        history.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: JSON.stringify(output) });
      }
    }
  } catch (err) {
    console.error("[agent] investigation loop failed:", err);
    const message = err instanceof Error ? err.message : "unknown error";
    reportAgentIncident(provider.name, message).catch(() => {});
    return {
      summary: `The investigation failed partway through: ${message}`,
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

  // Every branch below funnels through this at the end — it's what makes an
  // approval actually finish the task instead of leaving the chat waiting
  // for the user to say "continue." If the action came from a conversation,
  // resumeAfterAction runs a REAL next turn there — the agent can propose
  // the next step (still gated behind its own approval) or wrap up, on its
  // own, right after the action completes.
  async function finish<T>(result: T, summary: string) {
    await prisma.agentAction.update({ where: { id: actionId }, data: { status: "completed", resolvedAt: new Date() } });
    agentActionsTotal.inc({ type: action!.type, status: "completed" });
    if (action!.conversationId) {
      resumeAfterAction(action!.conversationId, summary).catch((err) => console.error("[agent] resumeAfterAction failed:", err));
    }
    return result;
  }

  if (action.type === "browser_action") {
    const evidence = action.evidence as { payload?: BrowserActionPayload } | null;
    if (!evidence?.payload) throw new Error("no browser action payload stored on this action");
    const result = await performBrowserAction(evidence.payload, action.conversationId ?? undefined);
    return finish(
      result,
      result.success
        ? `Done — ${result.note ?? "the browser action completed"}. Use browseWeb to read the page again — a click usually changes what's there — then continue from what you find.`
        : `That didn't work: ${result.error ?? "unknown error"}.`
    );
  }

  if (action.type === "form_fill") {
    const evidence = action.evidence as { payload?: FormFillPayload } | null;
    if (!evidence?.payload) throw new Error("no form payload stored on this action");
    const result = await performFormFill(evidence.payload, action.conversationId ?? undefined);
    return finish(
      result,
      result.success
        ? `Filled ${result.filled} field${result.filled === 1 ? "" : "s"}${result.submitted ? " and submitted the form" : ""}. Use browseWeb to read the page and confirm what happened, then continue.`
        : `The form fill failed: ${result.error ?? "unknown error"}.`
    );
  }

  if (action.type === "slack_message") {
    const evidence = action.evidence as { payload?: { channel: string; text: string } } | null;
    if (!evidence?.payload) throw new Error("no Slack payload stored on this action");
    const result = await postSlackMessage(evidence.payload.channel, evidence.payload.text, action.userId ?? undefined);
    return finish(
      result,
      result.success ? `Posted to ${evidence.payload.channel}.` : `Couldn't post: ${result.error}`
    );
  }

  if (action.type === "notion_append") {
    const evidence = action.evidence as { payload?: { pageId: string; text: string } } | null;
    if (!evidence?.payload) throw new Error("no Notion payload stored on this action");
    const result = await appendToNotionPage(evidence.payload.pageId, evidence.payload.text, action.userId ?? undefined);
    return finish(result, result.success ? "Added to the Notion page." : `Couldn't write to Notion: ${result.error}`);
  }

  if (action.type === "file_edit") {
    if (process.env.ENABLE_LOCAL_DEV_TOOLS !== "true") throw new Error("local dev tools are disabled (set ENABLE_LOCAL_DEV_TOOLS=true)");
    const evidence = action.evidence as { payload?: FileEditPayload } | null;
    if (!evidence?.payload) throw new Error("no file edit payload stored on this action");
    const result = await performFileEdit(evidence.payload);

    // Auto-open the file the moment it's actually written — this is the
    // whole point of asking "what should happen once it's created": the
    // answer is "it opens for you," not "go find it yourself."
    let openedNote = "";
    if (result.success) {
      const { openInEditor } = await import("./tools/devtools.js");
      const openResult = await openInEditor(evidence.payload.path);
      openedNote = openResult.success ? ` Opened it in your editor.` : "";
    }

    return finish(
      result,
      result.success
        ? `Created ${evidence.payload.path}.${openedNote} Want me to add anything to it, or create something else?`
        : `Couldn't create the file: ${result.error ?? "unknown error"}.`
    );
  }

  if (action.type === "shell_command") {
    if (process.env.ENABLE_LOCAL_DEV_TOOLS !== "true") throw new Error("local dev tools are disabled (set ENABLE_LOCAL_DEV_TOOLS=true)");
    const evidence = action.evidence as { payload?: ShellCommandPayload } | null;
    if (!evidence?.payload) throw new Error("no shell command payload stored on this action");
    const result = await performShellCommand(evidence.payload);
    return finish(
      result,
      `Ran it. ${result.code === 0 ? "Exited cleanly." : `Exit code ${result.code}.`}${result.stdout ? `\n\n${result.stdout.slice(0, 500)}` : ""}`
    );
  }

  if (!action.incidentId) {
    return finish({ success: false, note: "no incident/service context attached to this action" }, "Couldn't complete that — no service context was attached to it.");
  }

  const incident = await prisma.incident.findUnique({ where: { id: action.incidentId }, include: { service: true } });
  if (!incident) throw new Error("incident not found");

  if (action.type === "restart_pod" || action.type === "rollback") {
    const result = await restartDeployment(incident.service.name);
    return finish(result, result.success ? `Restarted ${incident.service.name}.` : `Restart failed: ${result.reason ?? "unknown error"}.`);
  }

  return finish({ success: true, note: "no action required for this action type" }, "Done.");
}
