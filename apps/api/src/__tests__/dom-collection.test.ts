import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { collect } from "./_collect-fn.js";

// Tests the ACTUAL shipped logic — _collect-fn.ts is extracted verbatim from
// collectInteractiveElements in tools/browser.ts, not a reimplementation.
// Playwright can't run in this environment, so jsdom is how the DOM
// behaviour gets verified rather than assumed.
//
// The architectural change this file locks down: elements are identified by
// a stable data-act-id STAMPED ONTO THE DOM, never by a hand-built
// Playwright selector string. That removes an entire class of bugs that
// kept recurring one at a time — whitespace breaking role= matching, a
// field's label matching an unrelated element's text, wrong roles,
// truncated names, drifting hrefs — because none of those failure modes
// exist for a plain attribute match.
function render(html: string) {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const g = globalThis as unknown as { document: Document; window: unknown };
  g.document = dom.window.document;
  g.window = dom.window;

  dom.window.Element.prototype.getBoundingClientRect = function () {
    return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}) };
  };
  return dom;
}

describe("interactive element collection (real shipped logic)", () => {
  it("finds an EMPTY unlabeled textarea — the notepad case that was broken", () => {
    render(`<h1>Notepad</h1><textarea></textarea><button>Save</button>`);
    const out = collect();
    const textarea = out.find((e) => e.text.toLowerCase().includes("textarea"));
    expect(textarea, "an empty textarea must be reported to the agent").toBeDefined();
    // Ids are generation-prefixed ("1:e0") so a stale id can never
    // accidentally match a different page's element — see
    // element-staleness.test.ts for the mechanism this enables.
    expect(textarea!.id).toMatch(/^\d+:e\d+$/);
  });

  it("finds a contenteditable rich-text editor", () => {
    render(`<div contenteditable="true"></div>`);
    const editor = collect().find((e) => e.text === "text editor area");
    expect(editor, "rich-text editors must be reported").toBeDefined();
  });

  it("gives links their resolved href so the agent can navigate directly", () => {
    render(`<a href="https://example.com/page">Read more</a>`);
    const link = collect().find((e) => e.text === "Read more");
    expect(link?.href).toBe("https://example.com/page");
  });

  it("stamps a stable id onto the DOM element itself, not just the returned object", () => {
    // This is the actual mechanism the fix relies on: the id returned to
    // the model must correspond to a real, queryable attribute on the page,
    // or clicking "by id" later has nothing to resolve against.
    render(`<button>Save</button>`);
    const out = collect();
    const el = document.querySelector("button");
    expect(el?.getAttribute("data-act-id")).toBe(out[0].id);
  });

  it("never produces a selector string of any kind — ids only", () => {
    render(`<a href="https://x.com">SONG | ARTIST | 2026</a><input aria-label="Search" />`);
    for (const el of collect()) {
      expect(el.id).toMatch(/^\d+:e\d+$/);
      expect(Object.keys(el)).not.toContain("selector");
    }
  });

  it("distinguishes a labelled form field from unrelated text on the page", () => {
    // The exact real bug: a `text=` selector for a field labelled "Search"
    // matched an unrelated "How Search works" link elsewhere on the page,
    // because text= matches visible text, which an <input> never has. With
    // id-based matching this class of bug can't occur — each element gets
    // its own unique id regardless of what text happens to appear nearby.
    render(`
      <input aria-label="Search" />
      <a href="https://google.com/search/howsearchworks">How Search works</a>
    `);
    const out = collect();
    const field = out.find((e) => e.text === "Search");
    const link = out.find((e) => e.text === "How Search works");
    expect(field?.id).toBeDefined();
    expect(link?.id).toBeDefined();
    expect(field?.id).not.toBe(link?.id);
  });

  it("collapses newlines in the reported label — Playwright normalizes accessible names", () => {
    // From a real failing trace: a YouTube result link's innerText is
    // "12:56\nNow playing\nPiya Ghar Aaya". The id-based selector this
    // produces is immune to the underlying matching bug either way, but the
    // human-readable label shown to the model should still read cleanly.
    render(`<a href="https://youtube.com/watch?v=x">12:56\n\nNow playing\nPiya Ghar Aaya</a>`);
    const link = collect()[0];
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

  it("assigns unique, sequential ids across a page", () => {
    render(`<button>A</button><button>B</button><button>C</button>`);
    const ids = collect().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
