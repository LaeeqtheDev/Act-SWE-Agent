import { describe, it, expect } from "vitest";

// Mirrors the guard added to BOTH fill() fallbacks in tools/browser.ts.
// Ctrl+A with nothing focused selects the ENTIRE PAGE — that produced the
// "whole Google homepage highlighted blue" screenshot. The fallback must
// only ever run when the target element genuinely holds focus.
function shouldRunSelectAllFallback(elementHasFocus: boolean): boolean {
  return elementHasFocus;
}

describe("select-all fallback guard", () => {
  it("runs only when the target element holds focus", () => {
    expect(shouldRunSelectAllFallback(true)).toBe(true);
  });

  it("NEVER runs when focus is elsewhere — this selects the whole page", () => {
    expect(shouldRunSelectAllFallback(false)).toBe(false);
  });
});

// Mirrors the cancellation check added to performAction. A pending approved
// action was still executing after the user hit Stop, opening a page for a
// task they'd already abandoned.
function shouldRunApprovedAction(status: string, conversationCancelled: boolean): boolean {
  if (status !== "approved") return false;
  if (conversationCancelled) return false;
  return true;
}

describe("approved action cancellation check", () => {
  it("runs an approved action on a live conversation", () => {
    expect(shouldRunApprovedAction("approved", false)).toBe(true);
  });

  it("refuses an approved action once the conversation was cancelled", () => {
    expect(shouldRunApprovedAction("approved", true)).toBe(false);
  });

  it("still refuses anything not actually approved", () => {
    expect(shouldRunApprovedAction("pending", false)).toBe(false);
    expect(shouldRunApprovedAction("rejected", false)).toBe(false);
  });
});
