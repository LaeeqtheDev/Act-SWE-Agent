import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, AgentMessage, AgentTurn, ToolDef } from "./types.js";

export function createAnthropicProvider(apiKey: string, model: string): AIProvider {
  const client = new Anthropic({ apiKey });

  return {
    name: "anthropic",
    model,
    async runTurn({ system, tools, history, signal }) {
      const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      }));

      const messages: Anthropic.MessageParam[] = [];
      for (const m of history) {
        if (m.role === "user") {
          messages.push({ role: "user", content: m.content });
        } else if (m.role === "assistant") {
          const blocks: Anthropic.ContentBlockParam[] = [];
          if (m.content) blocks.push({ type: "text", text: m.content });
          for (const tc of m.toolCalls ?? []) {
            blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
          }
          messages.push({ role: "assistant", content: blocks });
        } else if (m.role === "tool") {
          messages.push({
            role: "user",
            content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }],
          });
        }
      }

      const response = await client.messages.create(
        {
          model,
          max_tokens: 1500,
          system,
          tools: anthropicTools,
          messages,
        },
        { signal }
      );

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");

      const turn: AgentTurn = {
        toolCalls: toolUses.map((t) => ({ id: t.id, name: t.name, input: t.input as Record<string, unknown> })),
        text: textBlock?.text,
      };
      return turn;
    },
  };
}
