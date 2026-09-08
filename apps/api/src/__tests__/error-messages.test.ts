import { describe, it, expect } from "vitest";

// Mirrors explain() in components/agent/tool-trace.tsx. The expanded trace
// was showing people raw Playwright stack traces ("locator.click: Timeout
// 8000ms exceeded. Call log: waiting for locator(...)"), which is
// meaningless to anyone who didn't write the tool.
function explain(out: Record<string, unknown> | undefined): string | null {
  if (!out || typeof out !== "object") return null;
  const rawError = typeof out.error === "string" ? out.error : null;
  if (rawError) {
    if (/Timeout .*exceeded|waiting for locator/i.test(rawError))
      return "Couldn't find that element on the page — it may not have loaded, or the page changed.";
    if (/not connected/i.test(rawError)) return rawError;
    if (/Cancelled by user/i.test(rawError)) return "Stopped before this ran.";
    if (/rate limit/i.test(rawError)) return "Hit the AI provider's rate limit.";
    return rawError.split(/[.\n]/)[0].slice(0, 160);
  }
  if (out.success === false) return "That step didn't work.";
  if (typeof out.title === "string") return `Read: ${out.title}`;
  if (Array.isArray(out.results)) return `Found ${out.results.length} result${out.results.length === 1 ? "" : "s"}.`;
  if (out.found === true) return "Confirmed it's on the page.";
  if (out.success === true) return "Done.";
  return null;
}

describe("plain-English tool result summaries", () => {
  it("translates a real Playwright timeout instead of showing the stack trace", () => {
    const real =
      'Couldn\'t type into "role=textbox[name=/Search/i]": locator.click: Timeout 8000ms exceeded.\nCall log:\n  - waiting for locator(\'role=textbox\')';
    const msg = explain({ success: false, error: real });
    expect(msg).toBe("Couldn't find that element on the page — it may not have loaded, or the page changed.");
    expect(msg).not.toContain("locator");
    expect(msg).not.toContain("Timeout");
  });

  it("explains a rate limit in one line", () => {
    expect(explain({ error: "429 Rate limit reached for model gpt-oss-120b" })).toBe(
      "Hit the AI provider's rate limit."
    );
  });

  it("keeps genuinely useful messages as-is", () => {
    expect(explain({ error: "Slack isn't connected. Connect it in Settings." })).toContain("Slack isn't connected");
  });

  it("summarises successful results readably", () => {
    expect(explain({ title: "YouTube" })).toBe("Read: YouTube");
    expect(explain({ results: [1, 2, 3] })).toBe("Found 3 results.");
    expect(explain({ results: [1] })).toBe("Found 1 result.");
    expect(explain({ found: true })).toBe("Confirmed it's on the page.");
  });

  it("never returns a multi-line stack trace", () => {
    const msg = explain({ error: "Something broke.\n  at foo\n  at bar" });
    expect(msg).not.toContain("\n");
  });
});
