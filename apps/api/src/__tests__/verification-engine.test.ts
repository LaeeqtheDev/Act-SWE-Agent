import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import {
  verifyUrl,
  verifyTextPresent,
  verifyElementVisible,
  verifyInputValue,
  verifyAction,
  type ExpectedOutcome,
} from "../tools/verification.js";

// Tests the REAL exported functions from tools/verification.ts, not a
// reimplementation — same principle as dom-collection.test.ts. Playwright
// can't run in this environment, so a minimal fake Page wires the real
// verifier logic to a real jsdom document, which is what page.evaluate and
// page.locator ultimately touch.
function fakePage(html: string, url = "https://example.com") {
  const dom = new JSDOM(`<!DOCTYPE html><body>${html}</body>`);
  const doc = dom.window.document;

  return {
    url: () => url,
    evaluate: async (fn: (arg: unknown) => unknown, arg?: unknown) => {
      // The real page.evaluate runs in a browser context where `document`
      // is global — mirror that for the duration of the call.
      const g = globalThis as unknown as { document: Document };
      const prev = g.document;
      g.document = doc;
      try {
        return fn(arg);
      } finally {
        g.document = prev;
      }
    },
    locator: (selector: string) => ({
      first: () => ({
        isVisible: async () => {
          const el = doc.querySelector(selector);
          if (!el) return false;
          // jsdom has no real layout; treat "not display:none" as visible,
          // matching how the real getBoundingClientRect-based checks
          // elsewhere in this codebase distinguish present-but-hidden.
          return (el as HTMLElement).style.display !== "none";
        },
        evaluate: async (fn: (el: Element) => unknown) => {
          const el = doc.querySelector(selector);
          if (!el) throw new Error("no element");
          return fn(el);
        },
      }),
    }),
  } as unknown as import("playwright").Page;
}

describe("verifyUrl", () => {
  it("verifies when the URL contains the expected substring", () => {
    const page = fakePage("", "https://youtube.com/watch?v=abc123");
    const result = verifyUrl(page, "/watch");
    expect(result.verified).toBe(true);
    expect(result.check).toBe("url");
  });

  it("fails when the URL doesn't contain it — the exact YouTube case: still on results, not /watch", () => {
    const page = fakePage("", "https://youtube.com/results?search_query=x");
    const result = verifyUrl(page, "/watch");
    expect(result.verified).toBe(false);
    expect(result.actual).toBe("https://youtube.com/results?search_query=x");
  });

  it("is case-insensitive", () => {
    const page = fakePage("", "https://EXAMPLE.com/Watch");
    expect(verifyUrl(page, "/watch").verified).toBe(true);
  });
});

describe("verifyTextPresent", () => {
  it("finds text in rendered page content", () => {
    const page = fakePage("<p>Video is now playing</p>");
    return verifyTextPresent(page, "now playing").then((r) => {
      expect(r.verified).toBe(true);
      expect(r.check).toBe("text-present");
    });
  });

  it("finds text inside an input's VALUE, not just visible text", () => {
    // The reason this check exists at all: typed content lives in
    // element.value and never appears in document.body.innerText.
    const page = fakePage(`<input value="mera piya ghar aya" />`);
    return verifyTextPresent(page, "piya ghar").then((r) => {
      expect(r.verified).toBe(true);
    });
  });

  it("reports not-found honestly when the text genuinely isn't there", () => {
    const page = fakePage("<p>Something else entirely</p>");
    return verifyTextPresent(page, "expected phrase").then((r) => {
      expect(r.verified).toBe(false);
      expect(r.actual).toBe("not found");
    });
  });
});

describe("verifyElementVisible", () => {
  it("verifies a present, non-hidden element", async () => {
    const page = fakePage(`<div data-act-id="1:e0">content</div>`);
    const r = await verifyElementVisible(page, "1:e0");
    expect(r.verified).toBe(true);
    expect(r.check).toBe("element-visible");
  });

  it("fails when the element doesn't exist at all", async () => {
    const page = fakePage(`<div data-act-id="1:e0">content</div>`);
    const r = await verifyElementVisible(page, "1:e99");
    expect(r.verified).toBe(false);
  });
});

describe("verifyInputValue", () => {
  it("verifies when the field's value contains what was typed", async () => {
    const page = fakePage(`<input data-act-id="1:e0" value="mera piya ghar aya" />`);
    const r = await verifyInputValue(page, "1:e0", "mera piya ghar aya");
    expect(r.verified).toBe(true);
    expect(r.check).toBe("input-value");
  });

  it("still verifies on a partial/probe match — sites append autocomplete text", async () => {
    const page = fakePage(`<input data-act-id="1:e0" value="mera piya gh" />`);
    const r = await verifyInputValue(page, "1:e0", "mera piya gh");
    expect(r.verified).toBe(true);
  });

  it("fails on an empty field — exactly the 'typed but nothing landed' bug", async () => {
    const page = fakePage(`<input data-act-id="1:e0" value="" />`);
    const r = await verifyInputValue(page, "1:e0", "mera piya ghar aya");
    expect(r.verified).toBe(false);
    expect(r.actual).toBe("");
  });

  it("fails when the field shows unrelated content — a reset controlled input", async () => {
    const page = fakePage(`<input data-act-id="1:e0" value="placeholder text" />`);
    const r = await verifyInputValue(page, "1:e0", "mera piya ghar aya");
    expect(r.verified).toBe(false);
  });
});

describe("verifyAction dispatcher", () => {
  it("dispatches url", async () => {
    const page = fakePage("", "https://x.com/watch");
    const outcome: ExpectedOutcome = { type: "url", value: "/watch" };
    expect((await verifyAction(page, outcome)).check).toBe("url");
  });

  it("dispatches text-present", async () => {
    const page = fakePage("<p>hello</p>");
    const outcome: ExpectedOutcome = { type: "text-present", value: "hello" };
    expect((await verifyAction(page, outcome)).check).toBe("text-present");
  });

  it("dispatches element-visible", async () => {
    const page = fakePage(`<div data-act-id="1:e0">x</div>`);
    const outcome: ExpectedOutcome = { type: "element-visible", value: "1:e0" };
    expect((await verifyAction(page, outcome)).check).toBe("element-visible");
  });

  it("dispatches input-value", async () => {
    const page = fakePage(`<input data-act-id="1:e0" value="hi" />`);
    const outcome: ExpectedOutcome = { type: "input-value", value: "hi", elementId: "1:e0" };
    expect((await verifyAction(page, outcome)).check).toBe("input-value");
  });
});
