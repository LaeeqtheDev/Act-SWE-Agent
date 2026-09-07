import { describe, it, expect } from "vitest";

// Mirrors the verification logic added to typeInto in tools/browser.ts.
// Playwright can't run in this sandbox, so this locks down the DECISION
// rules — when to report success vs a specific, actionable failure —
// independent of the browser itself.

function landed(fieldValue: string, typed: string): boolean {
  const probe = typed.slice(0, Math.min(10, typed.length));
  return fieldValue.includes(probe);
}

describe("typeInto: did the text actually land", () => {
  it("confirms success when the field contains what was typed", () => {
    expect(landed("hello world", "hello world")).toBe(true);
  });

  it("confirms success even if the site appended something after", () => {
    expect(landed("hello world (edited)", "hello world")).toBe(true);
  });

  it("reports failure when the field is empty after typing", () => {
    expect(landed("", "hello world")).toBe(false);
  });

  it("reports failure when a controlled input reset the value", () => {
    // The exact React-controlled-input failure mode: onChange resets state
    // faster than pressSequentially can react, leaving stale content.
    expect(landed("placeholder text", "hello world")).toBe(false);
  });

  it("handles very short typed text without a misleadingly short probe", () => {
    expect(landed("ok", "ok")).toBe(true);
    expect(landed("", "ok")).toBe(false);
  });
});
