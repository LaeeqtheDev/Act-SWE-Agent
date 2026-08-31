import { PrismaClient } from "@prisma/client";
import { getProvider } from "./providers/index.js";
import type { AgentMessage, ToolCall } from "./providers/index.js";
import { getTools, runTool, compactHistoryForRequest } from "./tools/index.js";
import { checkAndIncrementUsage, UsageLimitError } from "./usage.js";

const prisma = new PrismaClient();

const CHAT_SYSTEM_PROMPT = `You are Act SWE Agent — an open-source, model-agnostic AI agent embedded in a
small SRE/incident-response platform. You can:
- Check the health, telemetry, and incident history of any of the platform's services
- Read live Kubernetes pod/cluster data when a cluster is reachable
- Browse the web with a real browser (browseWeb) to check status pages, docs, or look things up
- Read this project's own files (readProjectFile, listProjectDirectory) if local dev tools are enabled
- Propose write actions — restarting a pod, rolling back, a browser click/fill, editing a file, or
  running a shell command — via proposeAction

CRITICAL — proposeAction NEVER executes anything. It only creates a pending approval. Never say a file
was "created," "added," or "saved," never say a command "ran," and never describe an action as done unless
its tool result explicitly says so. If you called proposeAction, the correct thing to say is exactly that
it's pending — the user approves it right in this chat with the button next to your message, not by
opening any external tool themselves. After you propose something, stop and wait; don't narrate follow-up
steps for a file or action that doesn't exist yet.

No emoji, ever. Be direct and concise, plain text only.

Use tools whenever they'd give a better answer than guessing — don't ask permission to look something up,
just do it and report what you found. After completing something (an answer, a lookup, a proposal), briefly
suggest a natural next step or ask what the user wants to do next — don't just stop cold.

You're running with a small, rate-limited model — budget your tool calls. Try one well-chosen search or
page before trying another; if a couple of attempts don't turn up a clean answer, tell the user what you
found and what you'd need to check next, rather than repeatedly searching the same thing.`;

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

// Called from agent.ts's performAction() once an action that was proposed
// from THIS conversation actually completes — this is what makes the chat
// continue naturally after an approval instead of going dead. The user
// doesn't have to come back and ask "did it work?"; the answer is already
// waiting in the conversation.
export async function appendFollowUp(conversationId: string, content: string) {
  await prisma.chatMessage.create({ data: { conversationId, role: "assistant", content } });
}

export interface ChatReply {
  reply: string;
  toolTrace: { name: string; input: unknown; output: unknown }[];
  provider?: string;
}

export async function sendMessage(conversationId: string, userText: string, userId?: string): Promise<ChatReply> {
  // Hosted mode only — self-hosted/BYOK runs (no userId) never hit a limit,
  // and ownership is verified so one user can never message into another's
  // conversation even if they somehow knew its id.
  if (userId) {
    await assertOwnership(conversationId, userId);
    try {
      await checkAndIncrementUsage(userId);
    } catch (err) {
      if (err instanceof UsageLimitError) {
        return { reply: err.message, toolTrace: [] };
      }
      throw err;
    }
  }

  const provider = await getProvider(userId);
  if (!provider) {
    return {
      reply:
        "No AI provider is configured yet. Set AI_PROVIDER and a matching API key (see apps/api/.env.example) and try again.",
      toolTrace: [],
    };
  }

  await prisma.chatMessage.create({ data: { conversationId, role: "user", content: userText } });

  // Auto-title the conversation from its first message, so the sidebar
  // shows something meaningful instead of "Untitled" for every chat.
  const existing = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (existing && !existing.title) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { title: userText.slice(0, 60) },
    });
  }

  const priorMessages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  const history: AgentMessage[] = priorMessages.map((m: { role: string; content: string; toolCalls: unknown; toolCallId: string | null; toolName: string | null }) => {
    if (m.role === "user") return { role: "user", content: m.content } as AgentMessage;
    if (m.role === "tool") {
      return { role: "tool", toolCallId: m.toolCallId ?? "", toolName: m.toolName ?? "", content: m.content } as AgentMessage;
    }
    return {
      role: "assistant",
      content: m.content,
      toolCalls: (m.toolCalls as ToolCall[] | null) ?? undefined,
    } as AgentMessage;
  });

  const toolTrace: ChatReply["toolTrace"] = [];
  let finalText = "";

  try {
    for (let turn = 0; turn < 4; turn++) {
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
        const output = await runTool(call.name, call.input, { conversationId });
        toolTrace.push({ name: call.name, input: call.input, output });
        history.push({ role: "tool", toolCallId: call.id, toolName: call.name, content: JSON.stringify(output) });
        await prisma.chatMessage.create({
          data: {
            conversationId,
            role: "tool",
            content: JSON.stringify(output),
            toolName: call.name,
            toolCallId: call.id,
          },
        });
      }
    }

    if (!finalText.trim()) {
      finalText = "I looked into that but didn't reach a final answer in the time I had — try asking again, maybe more specifically.";
    }
  } catch (err) {
    console.error("[chat] tool-calling loop failed:", err);
    finalText = `Something went wrong talking to ${provider.name}: ${err instanceof Error ? err.message : "unknown error"}`;
  }

  await prisma.chatMessage.create({ data: { conversationId, role: "assistant", content: finalText } });

  return { reply: finalText, toolTrace, provider: `${provider.name}/${provider.model}` };
}
