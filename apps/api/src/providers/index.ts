import { createAnthropicProvider } from "./anthropic.js";
import { createOpenAICompatibleProvider } from "./openai-compatible.js";
import type { AIProvider } from "./types.js";
import { getDecryptedProviderConfig } from "../settings.js";

export type { AIProvider, AgentMessage, AgentTurn, ToolCall, ToolDef } from "./types.js";

// Preset base URLs and available models for OpenAI-compatible backends. Add
// a new one here and it's immediately selectable everywhere — settings UI,
// AI_PROVIDER env var, no other code changes.
export const OPENAI_COMPATIBLE_PRESETS: Record<
  string,
  { baseURL?: string; envKey: string; defaultModel: string; models: string[] }
> = {
  openai: {
    envKey: "OPENAI_API_KEY",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini"],
  },
  grok: {
    baseURL: "https://api.x.ai/v1",
    envKey: "XAI_API_KEY",
    defaultModel: "grok-2-latest",
    models: ["grok-2-latest", "grok-2-mini"],
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    envKey: "GROQ_API_KEY",
    defaultModel: "openai/gpt-oss-20b",
    models: [
      "openai/gpt-oss-20b",
      "openai/gpt-oss-120b",
      "llama-3.1-8b-instant",
      "llama-3.3-70b-versatile",
      "groq/compound-mini",
      "groq/compound",
    ],
  },
  ollama: {
    baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
    envKey: "OLLAMA_API_KEY",
    defaultModel: "llama3.1",
    models: ["llama3.1", "llama3.2", "qwen2.5", "mistral"],
  },
};

export const ANTHROPIC_MODELS = ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"];

function buildProvider(providerName: string, apiKey: string, model: string): AIProvider | null {
  if (providerName === "anthropic") {
    return createAnthropicProvider(apiKey, model);
  }
  const preset = OPENAI_COMPATIBLE_PRESETS[providerName];
  if (!preset) return null;
  return createOpenAICompatibleProvider({ providerName, apiKey, baseURL: preset.baseURL, model });
}

// Resolution order: a key saved from the settings UI (DB, encrypted) takes
// priority over env vars, so pasting a key in the UI "just works" without
// touching .env or restarting anything. Falls back to env vars when no UI
// config has been saved yet — so it keeps working exactly as before for
// anyone who prefers .env.
export async function getProvider(): Promise<AIProvider | null> {
  const dbConfig = await getDecryptedProviderConfig().catch(() => null);
  if (dbConfig?.apiKey) {
    const provider = buildProvider(dbConfig.provider, dbConfig.apiKey, dbConfig.model);
    if (provider) return provider;
  }

  const providerName = (process.env.AI_PROVIDER || "groq").toLowerCase();

  if (providerName === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    return createAnthropicProvider(apiKey, process.env.AI_MODEL || "claude-sonnet-4-5");
  }

  const preset = OPENAI_COMPATIBLE_PRESETS[providerName];
  if (!preset) return null;

  const apiKey = process.env[preset.envKey] || (providerName === "ollama" ? "ollama" : "");
  if (!apiKey) return null;

  return createOpenAICompatibleProvider({
    providerName,
    apiKey,
    baseURL: preset.baseURL,
    model: process.env.AI_MODEL || preset.defaultModel,
  });
}
