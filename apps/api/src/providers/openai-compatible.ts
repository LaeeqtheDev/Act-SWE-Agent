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
    async runTurn({ system, tools, history }) {
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

      const response = await client.chat.completions.create({
        model: opts.model,
        messages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
      });

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
