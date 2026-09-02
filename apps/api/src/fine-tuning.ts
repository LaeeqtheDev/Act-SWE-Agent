import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// This is deliberately NOT a fine-tuning pipeline — actually training a
// model needs real infrastructure (a training job, GPU time or a provider's
// fine-tuning API, and hosting the resulting weights) that doesn't exist in
// this project and isn't something to fake. What's real and buildable
// without any of that: exporting your own real conversation history in the
// standard JSONL format OpenAI's (and most other providers') fine-tuning
// APIs expect, so YOU can feed it into an actual fine-tuning job if you
// want to go that route later. This is a starting point, not a finished
// pipeline — see the limitation note below.
//
// Limitation, stated plainly: this only exports plain user/assistant text
// exchanges. Tool-calling turns (the majority of what this agent actually
// does) are skipped, because representing them correctly requires
// provider-specific function-calling training formats that differ enough
// between OpenAI/Anthropic/Groq that a one-size export would be misleading.
// A real tool-use fine-tuning export is a bigger, provider-specific effort.

export async function exportTrainingDataJsonl(minMessages = 4): Promise<string> {
  const conversations = await prisma.conversation.findMany({
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  const lines: string[] = [];

  for (const conv of conversations) {
    // Only plain user/assistant text — skip tool calls/results (see the
    // limitation note above) and skip any assistant message that came from
    // a tool-calling turn (empty text, or paired with toolCalls).
    const cleanMessages = conv.messages.filter(
      (m: { role: string; content: string; toolCalls: unknown }) =>
        (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0 && !m.toolCalls
    );

    if (cleanMessages.length < minMessages) continue; // too short to be useful training signal

    const messages = cleanMessages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));
    lines.push(JSON.stringify({ messages }));
  }

  return lines.join("\n");
}

export async function countEligibleConversations(minMessages = 4): Promise<number> {
  const jsonl = await exportTrainingDataJsonl(minMessages);
  return jsonl ? jsonl.split("\n").length : 0;
}
