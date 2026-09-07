import OpenAI from "openai";
import type { AIProvider, AgentMessage, AgentTurn, ToolDef } from "./types.js";

// Covers any backend that speaks the OpenAI chat-completions + function-calling
// format — which, beyond OpenAI itself, includes xAI's Grok API, Groq, and a
// local Ollama server. One adapter, four+ providers, just by changing the
// base URL and default model.
export function createOpenAICompatibleProvider(opts: {
  providerName: string;
  apiKey: string;
  baseURL?: string;
  model: string;
}): AIProvider {
  const client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });

  return {
    name: opts.providerName,
    model: opts.model,
    async runTurn({ system, tools, history, signal }) {
      const openaiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      }));

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: system }];
      for (const m of history) {
        if (m.role === "user") {
          messages.push({ role: "user", content: m.content });
        } else if (m.role === "assistant") {
          messages.push({
            role: "assistant",
            content: m.content || null,
            tool_calls: m.toolCalls?.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
          });
        } else if (m.role === "tool") {
          messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
        }
      }

      // Smaller models sometimes hallucinate a tool that isn't in the list
      // (e.g. inventing "search"). Groq validates this server-side and
      // returns a 400 with code "tool_use_failed", which would otherwise
      // kill the whole conversation. Retry once with an explicit correction
      // naming the tools that actually exist — that recovers the turn
      // instead of losing it.
      // Free tiers (Groq's is 8,000 tokens/minute) reject with a 429 and a
      // retry-after header telling you exactly how long to wait. Waiting
      // and retrying turns a hard failure into a pause — the alternative
      // was losing the whole conversation ~20 seconds before it would have
      // worked. Two retries max, so a genuinely exhausted quota still fails
      // fast rather than hanging for minutes.
      const callWithRateLimitRetry = async (msgs: typeof messages, attempt = 0): Promise<OpenAI.Chat.ChatCompletion> => {
        try {
          return await client.chat.completions.create(
            {
              model: opts.model,
              messages: msgs,
              tools: openaiTools.length > 0 ? openaiTools : undefined,
            },
            { signal }
          );
        } catch (err) {
          const status = (err as { status?: number })?.status;
          if (status !== 429 || attempt >= 2) throw err;

          const headers = (err as { headers?: Record<string, string> })?.headers;
          const retryAfter = Number(headers?.["retry-after"]) || 20;
          const waitMs = Math.min(retryAfter + 1, 30) * 1000;
          console.log(`[provider] rate limited, waiting ${waitMs / 1000}s before retry ${attempt + 1}/2`);
          await new Promise((r) => setTimeout(r, waitMs));
          return callWithRateLimitRetry(msgs, attempt + 1);
        }
      };

      let response;
      try {
        response = await callWithRateLimitRetry(messages);
      } catch (err) {
        const isToolHallucination =
          err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "tool_use_failed";
        if (!isToolHallucination) throw err;

        const available = openaiTools.map((t) => t.function.name).join(", ");
        response = await callWithRateLimitRetry([
          ...messages,
          {
            role: "system",
            content: `Your last response tried to call a tool that does not exist. The ONLY tools available are: ${available}. Call one of those, or answer directly without any tool call.`,
          },
        ]);
      }

      const choice = response.choices[0];
      const toolCalls = (choice.message.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>,
      }));

      const turn: AgentTurn = { toolCalls, text: choice.message.content ?? undefined };
      return turn;
    },
  };
}
