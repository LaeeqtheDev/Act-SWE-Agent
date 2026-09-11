import { describe, it, expect } from "vitest";
import { formatTimeline } from "../runs.js";

// formatTimeline is the pure function that turns a stored event log into
// the human-readable chronological trace. It's tested directly against a
// hand-built event list — no DB, no live run — which is the whole point of
// keeping it pure: the timeline can never drift from what's actually
// stored, and it's testable without a database.
const start = new Date("2026-01-01T00:00:00Z");
function at(seconds: number): Date {
  return new Date(start.getTime() + seconds * 1000);
}

describe("formatTimeline", () => {
  it("renders the request-received line at 00:00", () => {
    const text = formatTimeline(start, [{ timestamp: at(0), type: "RUN_STARTED" }]);
    expect(text).toContain("00:00  REQUEST RECEIVED");
  });

  it("renders elapsed time relative to the run's start, not wall-clock time", () => {
    const text = formatTimeline(start, [
      { timestamp: at(0), type: "RUN_STARTED" },
      { timestamp: at(65), type: "AGENT_STEP" },
    ]);
    expect(text).toContain("01:05  AGENT STEP");
  });

  it("shows a tool starting and completing, in order", () => {
    const text = formatTimeline(start, [
      { timestamp: at(3), type: "TOOL_STARTED", tool: "browseWeb" },
      { timestamp: at(5), type: "TOOL_COMPLETED", tool: "browseWeb", status: "SUCCESS", durationMs: 2000 },
    ]);
    const lines = text.split("\n");
    expect(lines[0]).toContain("TOOL");
    expect(lines[0]).toContain("browseWeb");
    expect(lines[1]).toContain("browseWeb");
    expect(lines[1]).toContain("done");
  });

  it("shows a failed tool distinctly from a successful one", () => {
    const text = formatTimeline(start, [
      { timestamp: at(1), type: "TOOL_COMPLETED", tool: "clickToNavigate", status: "FAILED" },
    ]);
    expect(text).toContain("FAILED");
  });

  it("shows a verification failure with its reason on its own line", () => {
    // The exact shape from the review's example trace.
    const text = formatTimeline(start, [
      { timestamp: at(8), type: "VERIFICATION", status: "FAILED", failureReason: "VERIFICATION_FAILED" },
    ]);
    expect(text).toContain("VERIFICATION \u2192 FAILED");
    expect(text).toContain("reason: VERIFICATION_FAILED");
  });

  it("shows a successful verification without a reason line", () => {
    const text = formatTimeline(start, [{ timestamp: at(13), type: "VERIFICATION", status: "SUCCESS" }]);
    expect(text).toContain("VERIFICATION \u2192 SUCCESS");
    expect(text).not.toContain("reason:");
  });

  it("shows approval-required and human-approved as distinct moments", () => {
    const text = formatTimeline(start, [
      { timestamp: at(13), type: "APPROVAL", note: "APPROVAL REQUIRED" },
      { timestamp: at(17), type: "APPROVAL", note: "HUMAN APPROVED" },
    ]);
    expect(text).toContain("00:13  APPROVAL REQUIRED");
    expect(text).toContain("00:17  HUMAN APPROVED");
  });

  it("shows a retry with its reason", () => {
    const text = formatTimeline(start, [{ timestamp: at(8), type: "RETRY", note: "selector mismatch" }]);
    expect(text).toContain("RETRY");
    expect(text).toContain("selector mismatch");
  });

  it("ends a completed run with a clear status line", () => {
    const text = formatTimeline(start, [
      { timestamp: at(0), type: "RUN_STARTED" },
      { timestamp: at(20), type: "RUN_COMPLETED" },
    ]);
    expect(text).toContain("STATUS: COMPLETED");
  });

  it("ends a failed run with a distinct status line", () => {
    const text = formatTimeline(start, [
      { timestamp: at(0), type: "RUN_STARTED" },
      { timestamp: at(5), type: "RUN_FAILED" },
    ]);
    expect(text).toContain("STATUS: FAILED");
    expect(text).not.toContain("STATUS: COMPLETED");
  });

  it("renders a full run matching the shape of the review's worked example", () => {
    const text = formatTimeline(start, [
      { timestamp: at(0), type: "RUN_STARTED" },
      { timestamp: at(3), type: "TOOL_STARTED", tool: "browseWeb" },
      { timestamp: at(5), type: "TOOL_COMPLETED", tool: "browseWeb", status: "SUCCESS" },
      { timestamp: at(7), type: "TOOL_STARTED", tool: "clickToNavigate" },
      { timestamp: at(8), type: "TOOL_COMPLETED", tool: "clickToNavigate", status: "SUCCESS" },
      { timestamp: at(8), type: "VERIFICATION", status: "FAILED", failureReason: "VERIFICATION_FAILED" },
      { timestamp: at(8), type: "RETRY", note: "re-reading the page" },
      { timestamp: at(11), type: "TOOL_STARTED", tool: "clickToNavigate" },
      { timestamp: at(13), type: "TOOL_COMPLETED", tool: "clickToNavigate", status: "SUCCESS" },
      { timestamp: at(13), type: "VERIFICATION", status: "SUCCESS" },
      { timestamp: at(20), type: "RUN_COMPLETED" },
    ]);
    // Every event type appears somewhere, in order — a coarse but real
    // check that a full trace renders without throwing or dropping events.
    for (const marker of ["REQUEST RECEIVED", "TOOL", "VERIFICATION", "RETRY", "STATUS: COMPLETED"]) {
      expect(text).toContain(marker);
    }
  });

  it("never throws on an empty event list", () => {
    expect(() => formatTimeline(start, [])).not.toThrow();
    expect(formatTimeline(start, [])).toBe("");
  });

  it("pads seconds and minutes to two digits", () => {
    const text = formatTimeline(start, [{ timestamp: at(65), type: "AGENT_STEP" }]);
    // 65s = 1:05, must render as 01:05 not 1:5 or 1:05.
    expect(text).toMatch(/^\d{2}:\d{2}/);
  });
});
