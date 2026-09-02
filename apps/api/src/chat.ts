import { PrismaClient } from "@prisma/client";
import { getProvider } from "./providers/index.js";
import type { AgentMessage, ToolCall } from "./providers/index.js";
import { getTools, runTool, compactHistoryForRequest } from "./tools/index.js";
import { checkAndIncrementUsage, UsageLimitError } from "./usage.js";
import { detectToolFailure, reportAgentIncident } from "./agent-incidents.js";
import { toolCallsTotal, chatMessagesTotal } from "./metrics.js";

const prisma = new PrismaClient();

const CHAT_SYSTEM_PROMPT = `You are Act SWE Agent — an open-source, model-agnostic AI agent that gets real work done
on the user's behalf. You can:
- Check the health, telemetry, and incident history of the platform's services, and read live Kubernetes data
- Browse the web in a real browser (browseWeb) — and if CHROME_USER_DATA_DIR is set, that's the user's OWN
  logged-in Chrome, so Gmail, Calendar, Docs, LinkedIn, Facebook, Instagram, WhatsApp Web, Slack, X, and any
  other site they're signed into all work with their real session
- Click through pages freely (clickToNavigate) — buttons, tabs, "next page", "show more", expanding a listing
- Look up the user's saved details (getUserProfile) to fill forms with their real information
- Read the project's own files if local dev tools are enabled
- Propose write actions (proposeAction) — the only things that need approval

HOW TO WORK — this matters more than anything else here:

Finish the job. When someone says "find SWE jobs at Stripe," they want the actual list of jobs, not a
running commentary. Browse the careers page, click into the listings, read them, and come back with real
roles and links. When they say "apply to this," go to the application form, call getUserProfile, and
propose the completed form with their details already filled in. Chain as many browseWeb and
clickToNavigate calls as the task needs — that's what they're for.

When the task is to DO something on a page — play a video, open a result, start something — browsing to
the page is only step one. Read the interactiveElements you got back, pick the one that matches, and
clickToNavigate it. Don't stop after loading the page and describe what you see; the user asked you to
act, so act. "Play the top song" means: search, then click the actual video.

Be efficient. webSearch returns real results with titles, URLs, and snippets — if those answer the
question, ANSWER IT. Don't browse every result "to be thorough"; each page you open costs a turn you
may need later. Only browseWeb when a snippet is genuinely insufficient. You have a limited number of
turns, so spend them on the answer, not on confirming what you already found.

Never ask permission to look, read, click through, or navigate. clickToNavigate needs no approval and
never will: opening a page, switching a tab, or expanding a listing changes nothing. Use it freely and
keep going.

ONLY these need approval, via proposeAction: submitting a form or application (use type "form_fill" with
every field at once — never one approval per field), sending a message or email, posting or commenting,
restarting a pod, rolling back, editing a file, running a shell command. If it sends, posts, submits, or
applies, propose it. If it just looks or moves, do it yourself.

When you do propose something, propose the COMPLETE action — the whole filled form and the submit button
together, not a fragment. The user should see one clear thing to approve, do it once, and be done.

proposeAction never executes anything itself. Never say a form was submitted, a message sent, or a file
created unless a tool result says so. After proposing, stop narrating that action — you'll get a real
follow-up here when it completes, and you should continue the task from there automatically.

If getUserProfile comes back empty and a form needs personal details, say plainly that saving their info
in Settings will let you fill forms automatically next time, and ask only for what you need right now.

No emoji, ever. Plain text, direct and concise. Report what you actually found and did — not what you're
about to try.`;

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
async function runAgentLoop(conversationId: string, userText: string, userId: string | undefined, chargeUsage: boolean): Promise<ChatReply> {
  if (userId && chargeUsage) {
    try {
      await checkAndIncrementUsage(userId);
    } catch (err) {
      if (err instanceof UsageLimitError) return { reply: err.message, toolTrace: [] };
      throw err;
    }
  }

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

  try {
    const maxTurns = Number(process.env.AGENT_MAX_TURNS) || 10;
    for (let turn = 0; turn < maxTurns; turn++) {
      const result = await provider.runTurn({ system: CHAT_SYSTEM_PROMPT, tools: getTools(), history: compactHistoryForRequest(history) });

      if (result.toolCalls.length === 0) {
        finalText = result.text ?? "";
        break;
      }

      history.push({ role: "assistant", content: result.text ?? "", toolCalls: result.toolCalls });
      await prisma.chatMessage.create({
        data: { conversationId, role: "assistant", content: result.text ?? "", toolCalls: result.toolCalls as object },
      });

      for (const call of result.toolCalls) {
        const output = await runTool(call.name, call.input, { conversationId, userId });
        detectToolFailure(call.name, output).catch(() => {});
        toolCallsTotal.inc({ tool: call.name, outcome: output && typeof output === "object" && "error" in output ? "error" : "success" });
        toolTrace.push({ name: call.name, input: call.input, output });
        history.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: JSON.stringify(output) });
        await prisma.chatMessage.create({
          data: { conversationId, role: "tool", content: JSON.stringify(output), toolName: call.name, toolCallId: call.id },
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
    console.error("[chat] tool-calling loop failed:", err);
    const message = err instanceof Error ? err.message : "unknown error";
    // A rate limit isn't a mysterious failure — say what it is and what to
    // do about it, rather than a generic error the user can't act on.
    finalText = message.includes("Rate limit") || message.includes("rate_limit")
      ? `Hit ${provider.name}'s rate limit (free tiers are usually 8,000 tokens/minute). Wait about a minute and try again, or switch to a larger model in Settings — bigger models often have higher limits and need fewer steps.`
      : `Something went wrong talking to ${provider.name}: ${message}`;
    reportAgentIncident(provider.name, message, conversationId).catch(() => {});
  }

  await prisma.chatMessage.create({ data: { conversationId, role: "assistant", content: finalText } });

  return { reply: finalText, toolTrace, provider: `${provider.name}/${provider.model}` };
}

export async function sendMessage(conversationId: string, userText: string, userId?: string): Promise<ChatReply> {
  chatMessagesTotal.inc();
  // Hosted mode only — self-hosted/BYOK runs (no userId) never hit a limit,
  // and ownership is verified so one user can never message into another's
  // conversation even if they somehow knew its id.
  if (userId) await assertOwnership(conversationId, userId);
  return runAgentLoop(conversationId, userText, userId, true);
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
