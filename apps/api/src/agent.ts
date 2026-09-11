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
import { isSessionCancelled } from "./tools/browser.js";
import { recordEvent } from "./runs.js";
import {
  canExecute,
  canRetry,
  explainRefusal,
  isExecutionStuck,
  nextStatusAfterExecution,
  type ActionStatus,
} from "./action-lifecycle.js";

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
  const existing = await prisma.agentAction.findUnique({ where: { id: actionId } });
  if (!existing) throw new Error("action not found");

  // A row stuck in "executing" for way too long means the process that
  // claimed it crashed, was killed, or lost its network before it could
  // record the outcome — NOT that it's still genuinely working. Reclassify
  // it as UNKNOWN before doing anything else, since blindly treating it as
  // available-to-run-again is exactly the "worker crashes mid-write, then
  // restarts and duplicates the submission" scenario this whole design
  // exists to prevent.
  if (existing.status === "executing" && existing.executingSince && isExecutionStuck(existing.executingSince)) {
    await prisma.agentAction.update({ where: { id: actionId }, data: { status: "unknown" } });
    existing.status = "unknown";
  }

  if (!canExecute(existing.status as ActionStatus)) {
    throw new Error(explainRefusal(existing.status as ActionStatus));
  }

  // The atomic claim. This single conditional update is what makes a
  // concurrent double-click, a duplicate job-queue delivery, or two
  // requests racing on the same action id physically unable to both
  // proceed — updateMany with a status filter either matches this row (and
  // only this row, and only once) or matches nothing, and Postgres commits
  // that atomically. Whoever's update returns count 1 owns the execution;
  // everyone else sees count 0 and must back off rather than retry.
  const claim = await prisma.agentAction.updateMany({
    where: { id: actionId, status: "approved" },
    data: { status: "executing", executingSince: new Date(), attempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    // Someone else claimed it between our read above and this update —
    // read the current status fresh so the error is accurate, not stale.
    const now = await prisma.agentAction.findUnique({ where: { id: actionId }, select: { status: true } });
    throw new Error(explainRefusal((now?.status as ActionStatus) ?? "executing"));
  }

  const action = { ...existing, status: "executing" as ActionStatus };

  // Cancelling the chat marks the conversation's browser session cancelled,
  // but this path never checked it — so a pending approved action still
  // ran and opened a page after the user had already hit Stop. Refuse
  // outright rather than acting on a task the user abandoned. Since we've
  // already atomically claimed the row above, this is now a normal
  // FAILED outcome (the write genuinely did not happen), not a rejection
  // of an unapproved action.
  if (action.conversationId && isSessionCancelled(action.conversationId)) {
    await prisma.agentAction.update({
      where: { id: actionId },
      data: { status: "failed", result: { note: "Cancelled by the user before this ran." } as object },
    });
    throw new Error("This task was cancelled — the action was not run.");
  }

  // Approval happens as its own request, well after the run that proposed
  // the action has already completed — so there's no "current run" to
  // attach this to the way TOOL_STARTED or VERIFICATION events are. Best
  // effort: note it against the most recent run for this conversation, so
  // the timeline still shows the wait between "approval required" and
  // "human approved" even though they span two separate invocations.
  if (action.conversationId) {
    prisma.agentRun
      .findFirst({ where: { conversationId: action.conversationId }, orderBy: { startedAt: "desc" } })
      .then((run: { id: string } | null) => {
        if (run) return recordEvent({ runId: run.id, type: "APPROVAL", note: "HUMAN APPROVED", tool: actionId });
      })
      .catch(() => {});
  }

  // Every branch below funnels through this at the end — it's what makes an
  // approval actually finish the task instead of leaving the chat waiting
  // for the user to say "continue." If the action came from a conversation,
  // resumeAfterAction runs a REAL next turn there — the agent can propose
  // the next step (still gated behind its own approval) or wrap up, on its
  // own, right after the action completes.
  // Classifies whatever shape a given action type's executor returned into
  // a definite outcome. Most return {success: boolean}; shell commands
  // return an exit code instead. Anything with neither signal (the
  // no-op/fallback branches) defaults to success, since there was nothing
  // that could have failed.
  function classifyOutcome(result: unknown): "success" | "failure" {
    if (result && typeof result === "object") {
      if ("success" in result) return (result as { success: boolean }).success ? "success" : "failure";
      if ("code" in result) return (result as { code: number | null }).code === 0 ? "success" : "failure";
    }
    return "success";
  }

  async function finish<T>(result: T, summary: string) {
    const status = nextStatusAfterExecution(classifyOutcome(result));
    await prisma.agentAction.update({
      where: { id: actionId },
      data: { status, result: result as object, resolvedAt: new Date() },
    });
    agentActionsTotal.inc({ type: action!.type, status });
    // The conversation gets told what happened either way — a failed write
    // is still real information the user needs, not a dead end.
    if (action!.conversationId) {
      resumeAfterAction(action!.conversationId, summary).catch((err) => console.error("[agent] resumeAfterAction failed:", err));
    }
    return result;
  }

  // Wraps every action-type branch below. A THROWN exception here — a
  // network timeout mid-submit, the browser losing its connection — is
  // exactly the ambiguous case the whole design exists for: the external
  // write might have gone through before the failure, or might not have.
  // Marking it FAILED would make a retry unsafe (could duplicate a real
  // submission); marking it SUCCEEDED would silently skip a write that
  // never happened. UNKNOWN is the only honest answer, and it's set the
  // instant we catch this rather than waiting for the stuck-execution
  // timer to notice minutes later.
  try {
    return await dispatchAction();
  } catch (err) {
    await prisma.agentAction.update({
      where: { id: actionId },
      data: {
        status: "unknown",
        result: { note: `Interrupted: ${err instanceof Error ? err.message : "unknown error"}. Outcome is unverified.` } as object,
      },
    });
    agentActionsTotal.inc({ type: action.type, status: "unknown" });
    throw err;
  }

  async function dispatchAction(): Promise<unknown> {
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
}

// Retries a FAILED action — and only a failed one. Reuses the exact same
// actionId rather than creating a new row, which is the whole mechanism
// that lets the system recognise "this is attempt 2 of the same logical
// action" instead of two unrelated ones. Explicitly refuses SUCCEEDED
// (would duplicate a real write), UNKNOWN (the earlier attempt's outcome
// isn't known — retrying blind risks exactly that duplicate), REJECTED,
// EXPIRED, and PENDING.
export async function retryAction(actionId: string) {
  const action = await prisma.agentAction.findUnique({ where: { id: actionId } });
  if (!action) throw new Error("action not found");

  if (!canRetry(action.status as ActionStatus)) {
    throw new Error(explainRefusal(action.status as ActionStatus));
  }

  // Back to "approved" so performAction's own atomic claim (approved ->
  // executing) is the only path that ever starts real work — retryAction
  // doesn't execute anything itself, it just makes the row eligible again.
  await prisma.agentAction.update({ where: { id: actionId }, data: { status: "approved" } });
  return performAction(actionId);
}
