import { describe, it, expect } from "vitest";

// Mirrors the detection in chat.ts. Some models occasionally write out what
// a tool call would look like as plain text instead of actually invoking
// it — this locks down the pattern that catches that, and just as
// importantly, confirms it doesn't fire on ordinary replies that happen to
// mention JSON or contain braces.
function looksLikeLeakedToolCall(text: string): boolean {
  return (
    /^\s*\{[\s\S]*"type"\s*:\s*"[a-z_]+"[\s\S]*\}\s*$/i.test(text) &&
    /(browserPayload|formPayload|slackPayload|notionPayload|filePayload|shellPayload)/.test(text)
  );
}

describe("leaked tool-call detection", () => {
  it("catches the real leaked payload from the reported bug", () => {
    const leaked = `{
  "type": "browser_action",
  "summary": "Click the Play button on the opened YouTube video to start playback.",
  "browserPayload": {
    "action": "click",
    "selector": "role=button[name=/Play/i]"
  }
}`;
    expect(looksLikeLeakedToolCall(leaked)).toBe(true);
  });

  it("catches a compact single-line variant", () => {
    expect(
      looksLikeLeakedToolCall('{"type":"form_fill","formPayload":{"url":"https://x.com","fields":[]}}')
    ).toBe(true);
  });

  it("does not fire on an ordinary text reply", () => {
    expect(looksLikeLeakedToolCall("I opened the page and found three results.")).toBe(false);
  });

  it("does not fire on a reply that merely mentions JSON in prose", () => {
    expect(
      looksLikeLeakedToolCall("The API returned a JSON object with a \"type\" field set to \"error\".")
    ).toBe(false);
  });

  it("does not fire on a reply summarizing a tool's actual output", () => {
    // Real tool output often gets quoted back in prose — must not trip this.
    expect(
      looksLikeLeakedToolCall('The search returned: {"title":"Example","type":"article"} — a short piece.')
    ).toBe(false);
  });

  it("does not fire on an empty or whitespace-only reply", () => {
    expect(looksLikeLeakedToolCall("")).toBe(false);
    expect(looksLikeLeakedToolCall("   ")).toBe(false);
  });
});
