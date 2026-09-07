import { describe, it, expect } from "vitest";
import { compactHistoryForRequest, estimateHistoryTokens } from "../lib/history.js";
import type { AgentMessage } from "../providers/types.js";

describe("adaptive history trimming", () => {
  it("default trim keeps the 2 most recent tool results intact when they're small", () => {
    const history: AgentMessage[] = [
      { role: "tool", content: "x".repeat(500), toolCallId: "1", toolName: "webSearch" },
      { role: "tool", content: "y".repeat(500), toolCallId: "2", toolName: "browseWeb" },
      { role: "tool", content: "z".repeat(500), toolCallId: "3", toolName: "browseWeb" },
    ];
    const out = compactHistoryForRequest(history);
    expect(out[0].content.length).toBeLessThan(260); // oldest — truncated
    expect(out[1].content.length).toBe(500); // kept intact
    expect(out[2].content.length).toBe(500); // kept intact
  });

  it("caps even a RECENT result — the real bug a live trace exposed", () => {
    // A content-heavy page (Google Maps: many elements, each with a long
    // tracking URL) produced a single tool result several thousand
    // characters long. Before this fix, "recent" meant genuinely
    // unlimited — one such page could blow the whole per-minute budget by
    // itself, regardless of how well older history was trimmed.
    const history: AgentMessage[] = [
      { role: "tool", content: "M".repeat(9000), toolCallId: "1", toolName: "browseWeb" },
    ];
    const out = compactHistoryForRequest(history);
    expect(out[0].content.length, "even the single most recent result must have a hard ceiling").toBeLessThan(3200);
  });

  it("the 413-recovery level (keepFullLastN=1, maxLen=60) is meaningfully smaller", () => {
    const history: AgentMessage[] = [
      { role: "tool", content: "x".repeat(500), toolCallId: "1", toolName: "webSearch" },
      { role: "tool", content: "y".repeat(500), toolCallId: "2", toolName: "browseWeb" },
    ];
    const normal = compactHistoryForRequest(history);
    const aggressive = compactHistoryForRequest(history, 1, 60);

    const normalSize = normal.reduce((s, m) => s + m.content.length, 0);
    const aggressiveSize = aggressive.reduce((s, m) => s + m.content.length, 0);

    expect(aggressiveSize, "the 413 fallback must actually shrink the payload").toBeLessThan(normalSize);
    expect(aggressive[0].content.length).toBeLessThanOrEqual(110); // 60 + suffix
    expect(aggressive[1].content.length).toBe(500); // still the single most recent, kept
  });

  it("token estimate scales with content size — sanity check against the 4 chars/token rule", () => {
    const small = estimateHistoryTokens([{ role: "user", content: "hi" }], "system", 100);
    const large = estimateHistoryTokens(
      [{ role: "tool", content: "x".repeat(4000), toolCallId: "1", toolName: "browseWeb" }],
      "system",
      100
    );
    expect(large).toBeGreaterThan(small);
    // 4000 chars of tool content alone should estimate to roughly 1000 tokens.
    expect(large).toBeGreaterThan(900);
  });
});
