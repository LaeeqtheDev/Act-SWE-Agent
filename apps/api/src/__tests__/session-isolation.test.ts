import { describe, it, expect, beforeEach } from "vitest";
import { markSessionCancelled, isSessionCancelled, clearSessionCancelled } from "../tools/browser.js";

// Directly targets the reported bug: cancelling one chat appeared to
// continue from another. Every browser action is scoped by a session key
// (the conversationId), and this tests the actual exported cancellation
// state — not a description of how it's supposed to work — proving two
// conversations can never observe or affect each other's state.
//
// This is real coverage of the code-level isolation guarantee. It does
// NOT prove two real browser windows stay independent in a live run —
// that needs an actual browser, which this environment cannot provide.
// See docs/CHANGELOG.md #76 for exactly where that line is drawn.

describe("cross-conversation isolation: cancellation state", () => {
  const CHAT_A = "conv_aaa";
  const CHAT_B = "conv_bbb";

  beforeEach(() => {
    clearSessionCancelled(CHAT_A);
    clearSessionCancelled(CHAT_B);
  });

  it("cancelling Chat A does not cancel Chat B", () => {
    markSessionCancelled(CHAT_A);
    expect(isSessionCancelled(CHAT_A)).toBe(true);
    expect(isSessionCancelled(CHAT_B)).toBe(false);
  });

  it("holds in the reverse order too — cancelling B must not touch A", () => {
    markSessionCancelled(CHAT_B);
    expect(isSessionCancelled(CHAT_B)).toBe(true);
    expect(isSessionCancelled(CHAT_A)).toBe(false);
  });

  it("clearing Chat A's cancellation does not clear Chat B's", () => {
    markSessionCancelled(CHAT_A);
    markSessionCancelled(CHAT_B);
    clearSessionCancelled(CHAT_A);
    expect(isSessionCancelled(CHAT_A)).toBe(false);
    expect(isSessionCancelled(CHAT_B), "B must still be cancelled — A's clear leaked into B").toBe(true);
  });

  it("both chats can be independently cancelled and cleared without interference, in either order", () => {
    // Chat A: start long task, cancel it.
    markSessionCancelled(CHAT_A);
    expect(isSessionCancelled(CHAT_A)).toBe(true);

    // Chat B created fresh immediately after — must start with NO
    // inherited cancellation state from A.
    expect(isSessionCancelled(CHAT_B)).toBe(false);

    // Chat B starts and finishes normally.
    clearSessionCancelled(CHAT_B);
    expect(isSessionCancelled(CHAT_B)).toBe(false);

    // Chat A is still cancelled — B's activity didn't touch it.
    expect(isSessionCancelled(CHAT_A)).toBe(true);
  });

  it("an undefined/missing sessionKey (the self-host default session) is a DISTINCT key from any real conversationId", () => {
    // The actual mechanism behind the reported bug, if it existed anywhere:
    // any call site that forgot to pass conversationId falls through to a
    // shared "default" key. This proves that fallback is at least isolated
    // from a real, named conversation — it doesn't collide with CHAT_A.
    markSessionCancelled(undefined);
    expect(isSessionCancelled(CHAT_A)).toBe(false);
    clearSessionCancelled(undefined);
  });
});
