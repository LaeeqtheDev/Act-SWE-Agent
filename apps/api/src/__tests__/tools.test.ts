import { describe, it, expect } from "vitest";
import { compactHistoryForRequest } from "../tools/index.js";
import type { AgentMessage } from "../providers/index.js";

describe("compactHistoryForRequest", () => {
  it("leaves short history untouched", () => {
    const history: AgentMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ];
    expect(compactHistoryForRequest(history)).toEqual(history);
  });

  it("truncates older tool results but keeps the most recent ones full-length", () => {
    const longResult = "x".repeat(1000);
    const history: AgentMessage[] = [
      { role: "user", content: "do three things" },
      { role: "tool", toolCallId: "1", toolName: "toolA", content: longResult },
      { role: "tool", toolCallId: "2", toolName: "toolB", content: longResult },
      { role: "tool", toolCallId: "3", toolName: "toolC", content: longResult },
    ];

    const compacted = compactHistoryForRequest(history, 2);

    // Oldest tool result (toolA) should be truncated
    const toolA = compacted.find((m) => m.role === "tool" && m.toolCallId === "1");
    expect(toolA?.role).toBe("tool");
    if (toolA?.role === "tool") {
      expect(toolA.content.length).toBeLessThan(longResult.length);
      expect(toolA.content).toContain("truncated");
    }

    // Most recent two (toolB, toolC) should stay full-length
    const toolC = compacted.find((m) => m.role === "tool" && m.toolCallId === "3");
    if (toolC?.role === "tool") {
      expect(toolC.content).toBe(longResult);
    }
  });

  it("never mutates the original history array", () => {
    const original: AgentMessage[] = [{ role: "tool", toolCallId: "1", toolName: "t", content: "x".repeat(1000) }];
    const originalContent = original[0].role === "tool" ? original[0].content : "";
    compactHistoryForRequest(original, 0);
    expect(original[0].role === "tool" ? original[0].content : "").toBe(originalContent);
  });
});
