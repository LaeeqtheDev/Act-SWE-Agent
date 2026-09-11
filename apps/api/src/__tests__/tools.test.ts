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

describe("clickToNavigate exposes expectedOutcome — the actual fix for the execution-vs-reality gap", () => {
  it("the tool schema declares expectedOutcome as an available parameter", async () => {
    // This is the specific bug a live-torture audit found: the entire
    // verification engine (#70) was wired into clickToNavigate's
    // IMPLEMENTATION, but the tool SCHEMA the model actually sees never
    // exposed expectedOutcome at all — so every click silently fell back
    // to "did the URL change," which a wrong-but-still-valid candidate
    // (any other video on YouTube) trivially satisfies. If this property
    // is ever removed from the schema, that gap reopens silently.
    const { getTools } = await import("../tools/index.js");
    const clickTool = getTools().find((t) => t.name === "clickToNavigate");
    expect(clickTool, "clickToNavigate must be a registered tool").toBeDefined();

    const props = (clickTool!.inputSchema as { properties?: Record<string, unknown> }).properties;
    expect(props, "clickToNavigate must declare its input properties").toBeDefined();
    expect(props).toHaveProperty("expectedOutcome");
  });

  it("expectedOutcome only accepts the two verifier types the engine actually implements", async () => {
    const { getTools } = await import("../tools/index.js");
    const clickTool = getTools().find((t) => t.name === "clickToNavigate");
    const props = (clickTool!.inputSchema as { properties: Record<string, { properties?: Record<string, { enum?: string[] }> } > }).properties;
    const typeEnum = props.expectedOutcome.properties?.type?.enum;
    expect(typeEnum).toEqual(["url", "text-present"]);
  });
});
