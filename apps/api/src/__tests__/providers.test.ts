import { describe, it, expect } from "vitest";
import { isPremiumModel, ANTHROPIC_MODELS, OPENAI_COMPATIBLE_PRESETS } from "../providers/index.js";

describe("isPremiumModel", () => {
  it("flags known premium models", () => {
    expect(isPremiumModel("claude-sonnet-4-5")).toBe(true);
    expect(isPremiumModel("gpt-4o")).toBe(true);
    // Groq's whole catalog is free-tier by design — it must never be
    // classified premium, or selecting it 403s free-plan users outright.
    expect(isPremiumModel("openai/gpt-oss-120b")).toBe(false);
    expect(isPremiumModel("groq/compound")).toBe(false);
  });

  it("does not flag economy/free-tier models", () => {
    expect(isPremiumModel("openai/gpt-oss-20b")).toBe(false);
    expect(isPremiumModel("claude-haiku-4-5")).toBe(false);
  });

  it("does not flag an unrecognized model string", () => {
    expect(isPremiumModel("some-made-up-model")).toBe(false);
  });
});

describe("provider catalog", () => {
  it("every OpenAI-compatible preset has at least one model", () => {
    for (const [name, preset] of Object.entries(OPENAI_COMPATIBLE_PRESETS)) {
      expect(preset.models.length, `${name} should list at least one model`).toBeGreaterThan(0);
      expect(preset.models).toContain(preset.defaultModel);
    }
  });

  it("Anthropic model list is non-empty", () => {
    expect(ANTHROPIC_MODELS.length).toBeGreaterThan(0);
  });
});
