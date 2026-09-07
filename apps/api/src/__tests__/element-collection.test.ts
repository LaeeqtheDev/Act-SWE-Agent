import { describe, it, expect } from "vitest";

// Mirrors the classification in collectInteractiveElements. An empty
// <textarea> — a notepad, a comment box, a message field — has no label, no
// placeholder, and no name. It was being skipped entirely, so the agent
// could read a page but never saw anywhere to type, and would waste its
// whole step budget searching the web for a CSS selector instead.
function isTextInput(tag: string, type?: string, contentEditable?: string): boolean {
  return (
    tag === "textarea" ||
    contentEditable === "true" ||
    (tag === "input" && !["hidden", "submit", "button", "checkbox", "radio"].includes(type ?? "text"))
  );
}

function shouldInclude(label: string, tag: string, type?: string, contentEditable?: string): boolean {
  return Boolean(label) || isTextInput(tag, type, contentEditable);
}

describe("interactive element collection", () => {
  it("includes text inputs even with no label at all", () => {
    expect(shouldInclude("", "textarea"), "empty textarea must be visible to the agent").toBe(true);
    expect(shouldInclude("", "div", undefined, "true"), "contenteditable editor must be visible").toBe(true);
    expect(shouldInclude("", "input", "text"), "unlabeled text input must be visible").toBe(true);
    expect(shouldInclude("", "input", "email")).toBe(true);
  });

  it("still skips genuinely unusable unlabeled elements", () => {
    expect(shouldInclude("", "input", "hidden")).toBe(false);
    expect(shouldInclude("", "input", "checkbox")).toBe(false);
    expect(shouldInclude("", "span")).toBe(false);
    expect(shouldInclude("", "div")).toBe(false);
  });

  it("includes anything that does have a label", () => {
    expect(shouldInclude("Search", "input", "text")).toBe(true);
    expect(shouldInclude("Submit", "button")).toBe(true);
    expect(shouldInclude("Home", "a")).toBe(true);
  });
});
