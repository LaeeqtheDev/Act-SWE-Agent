// Provider-agnostic types. Every AI backend (Anthropic, or anything behind
// an OpenAI-compatible endpoint — OpenAI itself, xAI's Grok, Groq, a local
// Ollama server) implements the same AIProvider interface below, so the
// agent's tool-calling loop in agent.ts never needs to know which model
// it's actually talking to.

export interface ToolDef {
  name: string;
  description: string;
  // JSON Schema, same shape both Anthropic and OpenAI-compatible APIs expect.
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

// A flat, provider-neutral message history. Providers translate this into
// their own native request format on every call — slightly less efficient
// than keeping provider-native state, but it means swapping providers
// mid-investigation, or adding a new one, never touches the agent loop.
export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; content: string };

export interface AgentTurn {
  // Non-empty when the model wants to call one or more tools before
  // continuing. Empty (with `text` set) means the model is done.
  toolCalls: ToolCall[];
  text?: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  runTurn(opts: { system: string; tools: ToolDef[]; history: AgentMessage[] }): Promise<AgentTurn>;
}
