import { PrismaClient } from "@prisma/client";
import { getProvider } from "./providers/index.js";
import type { AgentMessage, ToolCall } from "./providers/index.js";
import { getTools, runTool, compactHistoryForRequest, setConnectedServices } from "./tools/index.js";
import { listConnections } from "./connections.js";
import { closeSession, markSessionCancelled, clearSessionCancelled } from "./tools/browser.js";
import { setProgress, clearProgress, describeTool } from "./progress.js";
import { checkAndIncrementUsage, UsageLimitError, isPleasantry, chargeExtraSteps } from "./usage.js";
import { detectToolFailure, reportAgentIncident } from "./agent-incidents.js";
import { toolCallsTotal, chatMessagesTotal } from "./metrics.js";

const prisma = new PrismaClient();

const CHAT_SYSTEM_PROMPT = `You are Act — an AI agent that finishes real tasks, not a chatbot that describes how to.
Reads (browseWeb, clickToNavigate, typeInto, pressKey, scrollPage, goBack, readPageAsMarkdown,
webSearch, getUserProfile) need no approval — use them freely and keep going.

Approval is ONLY for things that send data somewhere or change state you can't undo: submitting a form,
sending a message, posting, applying, restarting, editing a file, running a shell command. Clicking play
on a video, opening a result, expanding a section, typing into a search box — none of that sends
anything, so never propose it, just do it with clickToNavigate or typeInto. Proposing a play button
wastes the user's time on a decision that doesn't matter.

RULES, in priority order:
1. Finish the job. "Find X" means come back with real results, not a status update. Chain tool calls —
   several browseWeb in one turn if you need several pages — until you have the answer.
2. Act, don't describe. Loading a page is step one. "Play X" means: go to the site, typeInto its search
   box, pressKey "Enter", then OPEN the result. If that result has an href in interactiveElements,
   browseWeb it — a YouTube watch URL plays on load and is far more reliable than clicking a thumbnail.
   Only clickToNavigate when there's genuinely no href. If a click fails twice, stop clicking and use an
   href instead — repeating a failing click just burns your budget.
3. "Thanks"/"ok"/similar = talk, not work. Reply in one line, call no tools.
4. Never Google-search or web-search for a CSS selector — the fields you need are always already in
   interactiveElements from your last browseWeb ("textarea field (empty)" = an empty box you can type
   into). Never navigate to google.com's search box; webSearch exists so you don't have to.
5. Verify before claiming success: after typing/submitting, verifyPageContains a phrase you entered. Not
   found = it didn't work — say so, don't claim otherwise.
6. Don't re-browse a page you're already on (wastes a step, wipes what you typed). Empty results? Scroll
   first — feeds lazy-load. Wrong page? goBack, don't re-search. Click failed on a dynamic page? waitForElement, retry.
7. proposeAction never executes anything itself — don't narrate it as done. You'll get a real follow-up
   once it completes.
8. No emoji. Plain, direct, concise — report what happened, not what you're about to try.`;

export async function createConversation(title?: string, userId?: string) {
  return prisma.conversation.create({ data: { title, userId } });
}

export async function listConversations(userId?: string) {
  // Self-host (no userId concept): every conversation, unchanged original
  // behavior. Hosted mode: strictly this user's own conversations only.
  return prisma.conversation.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

async function assertOwnership(conversationId: string, userId?: string) {
  if (!userId) return; // self-hosted — no ownership concept
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation || conversation.userId !== userId) {
    throw new Error("conversation not found");
  }
}

export async function renameConversation(conversationId: string, title: string, userId?: string) {
  await assertOwnership(conversationId, userId);
  return prisma.conversation.update({ where: { id: conversationId }, data: { title } });
}

export async function deleteConversation(conversationId: string, userId?: string) {
  await assertOwnership(conversationId, userId);
  await prisma.chatMessage.deleteMany({ where: { conversationId } });
  await prisma.conversation.delete({ where: { id: conversationId } });
}

// One-off cleanup for conversations that were created but never actually
// used — e.g. leftover from before conversations were created lazily on
// first send. A conversation with zero messages is safe to remove.
export async function deleteEmptyConversations(userId?: string): Promise<{ deleted: number }> {
  const empty = await prisma.conversation.findMany({
    where: { messages: { none: {} }, ...(userId ? { userId } : {}) },
    select: { id: true },
  });
  for (const c of empty) {
    await prisma.conversation.delete({ where: { id: c.id } });
  }
  return { deleted: empty.length };
}

export async function getConversationMessages(conversationId: string, userId?: string) {
  await assertOwnership(conversationId, userId);
  return prisma.chatMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
}

export interface ChatReply {
  reply: string;
  toolTrace: { name: string; input: unknown; output: unknown }[];
  provider?: string;
}

// Shared core: builds history, runs the tool-calling loop, persists
// everything, returns the final reply. sendMessage() (a real user typing)
// and resumeAfterAction() (an approved action completing, continuing the
// task automatically) both funnel through this — the only difference is
// whether it counts against the usage limit.
async function runAgentLoop(
  conversationId: string,
  userText: string,
  userId: string | undefined,
  chargeUsage: boolean,
  cancelled?: AbortController
): Promise<ChatReply> {
  // Don't charge a task for "thanks" — see isPleasantry for why this is a
  // real check and not just a prompt instruction.
  const freeTurn = isPleasantry(userText);

  if (userId && chargeUsage && !freeTurn) {
    try {
      await checkAndIncrementUsage(userId);
    } catch (err) {
      if (err instanceof UsageLimitError) return { reply: err.message, toolTrace: [] };
      throw err;
    }
  }

  // Fires the instant the user presses Stop, rather than waiting for the
  // loop to reach its next checkpoint — that gap is how a browser launch
  // slipped through.
  cancelled?.signal.addEventListener("abort", () => {
    markSessionCancelled(conversationId);
    closeSession(conversationId).catch(() => {});
  });

  // A previously cancelled conversation must be usable again on the next
  // message, or the browser would stay permanently blocked.
  clearSessionCancelled(conversationId);

  // Refresh which integrations are available before building the tool list.
  await listConnections(userId)
    .then((c) => setConnectedServices(c.connected.map((x: { service: string }) => x.service)))
    .catch(() => setConnectedServices([]));

  const provider = await getProvider(userId);
  if (!provider) {
    return {
      reply: "No AI provider is configured yet. Set AI_PROVIDER and a matching API key (see apps/api/.env.example) and try again.",
      toolTrace: [],
    };
  }

  await prisma.chatMessage.create({ data: { conversationId, role: "user", content: userText } });

  const existing = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (existing && !existing.title) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { title: userText.slice(0, 60) } });
  }

  const priorMessages = await prisma.chatMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });

  const history: AgentMessage[] = priorMessages.map((m: { role: string; content: string; toolCalls: unknown; toolCallId: string | null; toolName: string | null }) => {
    if (m.role === "user") return { role: "user", content: m.content } as AgentMessage;
    if (m.role === "tool") {
      return { role: "tool", toolCallId: m.toolCallId ?? "", toolName: m.toolName ?? "", content: m.content } as AgentMessage;
    }
    return { role: "assistant", content: m.content, toolCalls: (m.toolCalls as ToolCall[] | null) ?? undefined } as AgentMessage;
  });

  const toolTrace: ChatReply["toolTrace"] = [];
  let finalText = "";
  let stepsUsed = 0;

  try {
    const maxTurns = Number(process.env.AGENT_MAX_TURNS) || 16;
    for (let turn = 0; turn < maxTurns; turn++) {
      // Checked between turns and again between tool calls below — a
      // cancelled request stops at the next boundary rather than running to
      // completion in the background.
      if (cancelled?.signal.aborted) {
        markSessionCancelled(conversationId);
        closeSession(conversationId).catch(() => {});
        return { reply: "Stopped.", toolTrace, provider: `${provider.name}/${provider.model}` };
      }

      stepsUsed++;
      setProgress(conversationId, stepsUsed, "Thinking");

      // Without this the model has no sense of its budget and explores
      // right up until it's cut off with nothing to show.
      const remaining = maxTurns - turn;
      const budgetNote =
        remaining <= 3
          ? `\n\nYou have ${remaining} step(s) left. Finish and answer with what you have now — do not start anything new.`
          : "";

      // A 413 means the WHOLE request — system prompt, every tool schema,
      // and the trimmed history — still exceeds the model's per-minute
      // token cap in one shot. That happens specifically on small free
      // tiers (Groq's is 8,000/min) once enough tools are offered, and the
      // previous fix only ever softened history over MULTIPLE turns — it
      // never reacted to a single oversized request failing outright. Retry
      // once, immediately, with history cut far harder (last tool result
      // only, each capped at 60 chars instead of 200) rather than losing
      // the whole task to one over-budget call.
      let result;
      try {
        result = await provider.runTurn({
          signal: cancelled?.signal,
          system: CHAT_SYSTEM_PROMPT + budgetNote,
          tools: freeTurn ? [] : getTools(),
          history: compactHistoryForRequest(history),
        });
      } catch (err) {
        const status = (err as { status?: number })?.status;
        const isTooLarge = status === 413 || /too large|request too large/i.test(String((err as Error)?.message ?? ""));
        if (!isTooLarge) throw err;

        result = await provider.runTurn({
          signal: cancelled?.signal,
          system: CHAT_SYSTEM_PROMPT + budgetNote,
          tools: freeTurn ? [] : getTools(),
          history: compactHistoryForRequest(history, 1, 60),
        });
      }

      if (result.toolCalls.length === 0) {
        // Some models occasionally write out what a tool call would look
        // like as plain text instead of actually invoking it — the model
        // "describes" calling proposeAction rather than calling it, and the
        // user sees raw JSON as the chat reply. Detected by shape rather
        // than exact wording, since the leaked JSON varies. When this
        // happens, retry the same turn once with an explicit correction
        // instead of showing the user broken output.
        const looksLikeLeakedToolCall =
          /^\s*\{[\s\S]*"type"\s*:\s*"[a-z_]+"[\s\S]*\}\s*$/i.test(result.text ?? "") &&
          /(browserPayload|formPayload|slackPayload|notionPayload|filePayload|shellPayload)/.test(result.text ?? "");

        if (looksLikeLeakedToolCall && turn < maxTurns - 1) {
          // AgentMessage only has user/assistant/tool roles — no system —
          // so the correction rides in as a synthetic tool result, which
          // models already treat as actionable feedback from the previous
          // step rather than conversational content.
          history.push({
            role: "tool",
            toolCallId: `correction-${turn}`,
            toolName: "system_correction",
            content:
              "Your last reply was JSON text describing a tool call instead of an actual tool call. Call proposeAction for real using the tool-calling mechanism, not as text in your response.",
          });
          continue;
        }

        finalText = result.text ?? "";
        break;
      }

      history.push({ role: "assistant", content: result.text ?? "", toolCalls: result.toolCalls });
      await prisma.chatMessage.create({
        data: { conversationId, role: "assistant", content: result.text ?? "", toolCalls: result.toolCalls as object },
      });

      if (cancelled?.signal.aborted) return { reply: "Stopped.", toolTrace, provider: `${provider.name}/${provider.model}` };

      // Tools that only READ can run at the same time — three web searches
      // took three times as long as one for no reason. Anything that drives
      // the shared browser page (clicking, scrolling, going back) must stay
      // sequential, since they'd otherwise fight over the same tab.
      // webSearch was removed from this list: it now drives the SHARED
      // browser page (so searches are visible), which means two running at
      // once navigate the same tab and overwrite each other's results.
      // Everything left here touches no shared state.
      const PARALLEL_SAFE = new Set(["listServices", "listIncidents", "getServiceHealth", "getRecentErrors", "getDeploymentHistory", "getKubernetesPodStatus", "getKubernetesEvents", "readProjectFile", "listProjectDirectory", "getUserProfile"]);

      const runOne = async (call: ToolCall) => {
        // Include the actual target (URL, query, text) so the live step is
        // inspectable while it runs, not just a generic label.
        const input = call.input as Record<string, unknown>;
        const target = input.url ?? input.query ?? input.text ?? input.selector ?? input.channel;
        setProgress(
          conversationId,
          stepsUsed,
          describeTool(call.name),
          typeof target === "string" ? target.slice(0, 120) : undefined
        );
        const output = await runTool(call.name, call.input, { conversationId, userId, signal: cancelled?.signal });
        detectToolFailure(call.name, output).catch(() => {});
        toolCallsTotal.inc({ tool: call.name, outcome: output && typeof output === "object" && "error" in output ? "error" : "success" });
        return { call, output };
      };

      const parallel = result.toolCalls.filter((t) => PARALLEL_SAFE.has(t.name));
      const sequential = result.toolCalls.filter((t) => !PARALLEL_SAFE.has(t.name));

      const results = await Promise.all(parallel.map(runOne));
      for (const call of sequential) {
        if (cancelled?.signal.aborted) return { reply: "Stopped.", toolTrace, provider: `${provider.name}/${provider.model}` };
        results.push(await runOne(call));
      }

      // Persist in the model's original call order so the transcript stays
      // coherent regardless of which finished first.
      for (const call of result.toolCalls) {
        const found = results.find((r) => r.call.id === call.id);
        if (!found) continue;
        toolTrace.push({ name: call.name, input: call.input, output: found.output });
        history.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: JSON.stringify(found.output) });
        await prisma.chatMessage.create({
          data: { conversationId, role: "tool", content: JSON.stringify(found.output), toolName: call.name, toolCallId: call.id },
        });
      }
    }

    if (!finalText.trim()) {
      // Hitting the turn cap used to throw away everything gathered along
      // the way. Ask the model to summarize what it actually found instead
      // — a partial answer beats "I didn't reach a final answer."
      try {
        const wrapUp = await provider.runTurn({
          system: "Summarize what you found, concisely and directly. No tool calls — just report the findings from the conversation above. If you genuinely found nothing useful, say so in one line.",
          tools: [],
          history: compactHistoryForRequest(history),
        });
        finalText = wrapUp.text?.trim() || "";
      } catch {
        // fall through to the generic message below
      }
    }

    if (!finalText.trim()) {
      finalText = "I ran out of steps before finishing that. Try narrowing it down, or ask me to pick up where I left off.";
    }
  } catch (err) {
    // An abort is the user pressing Stop, not a failure worth logging or
    // reporting as an error.
    if (cancelled?.signal.aborted || (err as { name?: string })?.name === "AbortError") {
      markSessionCancelled(conversationId);
      closeSession(conversationId).catch(() => {});
      return { reply: "Stopped.", toolTrace, provider: `${provider.name}/${provider.model}` };
    }
    console.error("[chat] tool-calling loop failed:", err);
    const message = err instanceof Error ? err.message : "unknown error";
    // A rate limit isn't a mysterious failure — say what it is and what to
    // do about it, rather than a generic error the user can't act on.
    finalText = message.includes("Rate limit") || message.includes("rate_limit")
      ? `Hit ${provider.name}'s rate limit (free tiers are usually 8,000 tokens/minute). Wait about a minute and try again, or switch to a larger model in Settings — bigger models often have higher limits and need fewer steps.`
      : `Something went wrong talking to ${provider.name}: ${message}`;
    reportAgentIncident(provider.name, message, conversationId).catch(() => {});
  }

  clearProgress(conversationId);
  await prisma.chatMessage.create({ data: { conversationId, role: "assistant", content: finalText } });

  // The first step was already charged up front; bill whatever else the
  // task actually consumed. Fire-and-forget — a billing hiccup shouldn't
  // fail a reply the user already received.
  if (userId && chargeUsage && !freeTurn && stepsUsed > 1) {
    chargeExtraSteps(userId, stepsUsed - 1).catch(() => {});
  }

  return { reply: finalText, toolTrace, provider: `${provider.name}/${provider.model}` };
}

export async function sendMessage(
  conversationId: string,
  userText: string,
  userId?: string,
  cancelled?: AbortController
): Promise<ChatReply> {
  chatMessagesTotal.inc();
  // Hosted mode only — self-hosted/BYOK runs (no userId) never hit a limit,
  // and ownership is verified so one user can never message into another's
  // conversation even if they somehow knew its id.
  if (userId) await assertOwnership(conversationId, userId);
  return runAgentLoop(conversationId, userText, userId, true, cancelled);
}

const MAX_AUTO_CONTINUE_DEPTH = 5;

// Called from agent.ts's performAction() once an approved action that came
// from a conversation actually completes. This is the fix for "it stops and
// waits for me to say continue": instead of just appending a static
// follow-up message, this runs a REAL next turn — the agent can propose the
// next step (which still needs its own approval — this never bypasses that
// gate) or conclude the task, without the user having to type anything.
// depth caps a runaway chain (a model that never stops proposing actions)
// at 5 automatic continuations — a genuinely long task can still finish,
// it just needs one manual nudge past that point.
export async function resumeAfterAction(conversationId: string, actionSummary: string): Promise<void> {
  // Depth is derived from the conversation itself, not passed in by the
  // caller — count how many auto-continuations have already fired in this
  // conversation (every one is stored with this exact prefix) rather than
  // threading a counter through agent.ts's approval chain.
  const priorAutoContinuations = await prisma.chatMessage.count({
    where: { conversationId, role: "user", content: { startsWith: "[Action completed:" } },
  });
  if (priorAutoContinuations >= MAX_AUTO_CONTINUE_DEPTH) return;

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) return;

  const continuationPrompt = `[Action completed: ${actionSummary}] Continue the task — propose the next step if there's more to do, or give the final result if you're done.`;

  try {
    await runAgentLoop(conversationId, continuationPrompt, conversation.userId ?? undefined, false);
    // If that turn itself proposed a new action, it sits pending — the next
    // resumeAfterAction call happens naturally when THAT one is approved
    // and completes (from agent.ts); the count above grows with it.
  } catch (err) {
    console.error("[chat] auto-continuation failed:", err);
  }
}
