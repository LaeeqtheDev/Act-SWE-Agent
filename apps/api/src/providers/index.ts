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
    // 120B by default, not 20B. On a browsing agent the bottleneck is
    // reasoning quality, not tokens/sec — a model that picks the right
    // selector first time finishes in 6 steps where a weaker one flails
    // through 16. Fewer, better steps is faster in wall-clock terms AND
    // cheaper, since every step resends the whole conversation.
    defaultModel: "openai/gpt-oss-120b",
    models: [
      "openai/gpt-oss-120b",
      "qwen/qwen3-32b",
      "llama-3.3-70b-versatile",
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "openai/gpt-oss-20b",
      "llama-3.1-8b-instant",
      "groq/compound",
      "groq/compound-mini",
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

// Phase 6 — which models are "premium." Free hosted accounts are restricted
// to the cheap/fast models (still genuinely useful — Groq's gpt-oss-20b is
// fast and capable); Pro unlocks the larger, more expensive ones. Self-hosted
// and BYOK usage is never restricted by this at all — see index.ts, this
// check only runs when HOSTED_MODE is true.
// gpt-oss-120b was on this list from before it became the free Groq
// default — a direct contradiction that silently 403'd anyone on the free
// plan who tried to select it, and the UI had no way to explain that, so
// the dropdown just looked like it wasn't saving. Groq's whole catalog is
// free-tier by design, so none of it belongs on a "premium" list.
const PREMIUM_MODELS = new Set([
  "claude-sonnet-4-5",
  "claude-opus-4-1",
  "gpt-4o",
  "gpt-4.1",
  "o3-mini",
  "grok-2-latest",
]);

export function isPremiumModel(model: string): boolean {
  return PREMIUM_MODELS.has(model);
}

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
// anyone who prefers .env. In hosted mode, pass the signed-in user's id so
// each person's own saved key/model is used, never someone else's.
export async function getProvider(userId?: string): Promise<AIProvider | null> {
  const dbConfig = await getDecryptedProviderConfig(userId).catch(() => null);
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
