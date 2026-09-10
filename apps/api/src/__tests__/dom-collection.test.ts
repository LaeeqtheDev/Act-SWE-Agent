import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { collect } from "./_collect-fn.js";

// Tests the ACTUAL shipped logic — _collect-fn.ts is extracted verbatim from
// collectInteractiveElements in tools/browser.ts, not a reimplementation.
// Playwright can't run in this environment, so jsdom is how the DOM
// behaviour gets verified rather than assumed.
function render(html: string) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const g = globalThis as unknown as { document: Document; window: unknown };
  g.document = dom.window.document;
  g.window = dom.window;

  // jsdom reports every element as 0x0 since it does no layout, and the
  // real code skips zero-size elements as "hidden". Stub a real box so the
  // visibility filter behaves as it does in a browser.
  dom.window.Element.prototype.getBoundingClientRect = function () {
    return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}) };
  };
  return dom;
}

describe("interactive element collection (real shipped logic)", () => {
  it("finds an EMPTY unlabeled textarea — the notepad case that was broken", () => {
    render(`<h1>Notepad</h1><textarea></textarea><button>Save</button>`);
    const out = collect();

    const textarea = out.find((e) => e.selector.includes("textarea"));
    expect(textarea, "an empty textarea must be reported to the agent").toBeDefined();
    expect(textarea!.selector).toContain("nth=");
    expect(textarea!.text.toLowerCase()).toContain("textarea");
  });

  it("finds a contenteditable rich-text editor", () => {
    render(`<div contenteditable="true"></div>`);
    const out = collect();
    const editor = out.find((e) => e.selector.includes("contenteditable"));
    expect(editor, "rich-text editors must be reported").toBeDefined();
    expect(editor!.text).toBe("text editor area");
  });

  it("gives links their resolved href so the agent can navigate directly", () => {
    render(`<a href="https://example.com/page">Read more</a>`);
    const out = collect();
    const link = out.find((e) => e.text === "Read more");
    expect(link?.href).toBe("https://example.com/page");
  });

  it("escapes regex characters in labels — an unescaped pipe breaks the selector", () => {
    render(`<a href="https://x.com">SONG | ARTIST | 2026</a>`);
    const out = collect();
    const link = out[0];
    expect(link.selector).toContain("\\|");
    // Must compile as a real regex, or every click on it silently fails.
    const pattern = link.selector.match(/\/(.+)\/i/)?.[1];
    expect(() => new RegExp(pattern!, "i")).not.toThrow();
  });

  it("NEVER gives a form field a text= selector — it matched the wrong element entirely", () => {
    // The real bug: `text=` matches an element's VISIBLE TEXT CONTENT, which
    // an <input> never has. On Google, the search box labelled "Search"
    // produced `text=/Search/i`, which matched the "How Search works" footer
    // LINK instead — so "type into the search box" navigated to a different
    // page and then select-all'd it.
    render(`
      <input aria-label="Search" />
      <a href="https://google.com/search/howsearchworks">How Search works</a>
    `);
    const out = collect();
    const field = out.find((e) => e.text === "Search");
    expect(field, "the input must be reported").toBeDefined();
    expect(field!.selector.startsWith("text="), `got ${field!.selector}`).toBe(false);
    expect(field!.selector).toContain("textbox");
  });

  it("respects a field's declared role — Google's search box is a combobox, not a textbox", () => {
    // Straight from a real google.com dump: the search box is a
    // <textarea role="combobox">. Hardcoding role=textbox produced a
    // selector matching nothing, so typing silently did nothing.
    render(`<textarea role="combobox" aria-label="Search"></textarea>`);
    const field = collect().find((e) => e.text === "Search");
    expect(field, "the search box must be reported").toBeDefined();
    expect(field!.selector).toContain("combobox");
    expect(field!.selector).not.toContain("textbox");
  });

  it("collapses newlines in labels — Playwright normalizes accessible names", () => {
    // Straight from a failing trace: a YouTube result link's innerText is
    // "12:56\nNow playing\nCoke Studio...". Building a selector from that
    // raw string produced role=link[name=/12:56\nNow playing/i], which can
    // NEVER match, because Playwright normalizes whitespace in accessible
    // names. Every click on a video result failed for this reason.
    render(`<a href="https://youtube.com/watch?v=x">12:56\n\nNow playing\nPiya Ghar Aaya</a>`);
    const link = collect()[0];
    expect(link.selector).not.toContain("\n");
    expect(link.text).not.toContain("\n");
  });

  it("skips hidden inputs and checkboxes that have no label", () => {
    render(`<input type="hidden" /><input type="checkbox" />`);
    expect(collect()).toHaveLength(0);
  });

  it("caps results so a huge page can't blow the token budget", () => {
    render(Array.from({ length: 60 }, (_, i) => `<button>Button ${i}</button>`).join(""));
    expect(collect().length).toBeLessThanOrEqual(25);
  });
});
