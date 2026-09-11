import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";
import { collect } from "./_collect-fn.js";
import { verifyUrl, verifyAction } from "../tools/verification.js";

// Phase 1 of the reliability torture pass: deliberately mutate the DOM
// between a collection and a (simulated) execution, and confirm the
// generation-embedded id mechanism (#69) actually holds under the specific
// shapes of mutation that break naive selector-based automation. This
// exercises the REAL collect() logic, not a description of it.

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

function currentGenerationOf(id: string): number {
  return Number(id.split(":")[0]);
}

describe("torture: React-style full rerender", () => {
  it("a rerender that replaces every node invalidates every old id", () => {
    render(`<button id="a">Play</button>`);
    const before = collect(1);
    expect(before[0].id).toBe("1:e0");

    // Simulate React tearing down and recreating the subtree — the node is
    // GONE, a new one with identical text takes its place. This is the
    // difference between "same text" and "same element" that a text-based
    // selector could never distinguish, and that the id mechanism doesn't
    // need to: the new node has no data-act-id at all until re-collected.
    document.body.innerHTML = `<button id="a">Play</button>`;
    const newNode = document.querySelector("button")!;
    expect(newNode.getAttribute("data-act-id")).toBeNull();

    // Only a FRESH collect() at the new (higher) generation makes the new
    // node targetable again.
    const after = collect(2);
    expect(after[0].id).toBe("2:e0");
    expect(currentGenerationOf(after[0].id)).toBeGreaterThan(currentGenerationOf(before[0].id));
  });
});

describe("torture: SPA navigation mid-flow", () => {
  it("an id collected on one 'page' cannot resolve on a completely different page's DOM", () => {
    render(`<a href="/results">Search results</a>`);
    const onResultsPage = collect(1);
    expect(onResultsPage[0].id).toBe("1:e0");

    // Simulate client-side routing replacing the whole page content — no
    // real navigation event, no page reload, exactly what breaks systems
    // that assume "navigation" means "the whole document changed."
    document.body.innerHTML = `<video data-testid="player"></video><button>Pause</button>`;
    const onVideoPage = collect(2);

    // The old id is not merely "different" — it structurally cannot exist
    // on this page, because this generation's collect() only ever stamps
    // e0, e1, ... at generation 2.
    const oldIdStillPresent = document.querySelector('[data-act-id="1:e0"]');
    expect(oldIdStillPresent).toBeNull();
    expect(onVideoPage.some((e) => e.id === "1:e0")).toBe(false);
  });
});

describe("torture: element disappears entirely (modal closes, item removed from a list)", () => {
  it("a removed element is absent from the next collection, not silently reassigned to something else", () => {
    render(`<button>First</button><button>Second</button><button>Third</button>`);
    const before = collect(1);
    expect(before).toHaveLength(3);
    const secondId = before[1].id;

    // Remove the middle element — the exact "infinite scroll pruned an
    // off-screen item" / "modal closed and its contents unmounted" shape.
    document.querySelectorAll("button")[1].remove();
    const after = collect(2);

    expect(after).toHaveLength(2);
    // Critically: the SURVIVING elements get NEW ids at the new generation
    // (e0, e1) rather than somehow preserving old indices — so a stale
    // reference to the old e1 ("First"'s neighbour) can never accidentally
    // land on "Third" just because it moved into that position.
    expect(after.find((e) => e.id === secondId)).toBeUndefined();
  });
});

describe("torture: a modal opens on top of existing content", () => {
  it("elements behind an open modal are still distinguishable from the modal's own controls", () => {
    render(`<button>Open</button>`);
    collect(1);

    // A modal is injected — this is content ADDED, not replacing anything,
    // which is a different mutation shape than the rerender/SPA cases above.
    document.body.insertAdjacentHTML("beforeend", `<div role="dialog"><button>Confirm</button><button>Cancel</button></div>`);
    const after = collect(2);

    // All FOUR now-visible controls get fresh, distinct ids at the new
    // generation — nothing from before generation 2 leaks through.
    expect(after.every((e) => currentGenerationOf(e.id) === 2)).toBe(true);
    expect(new Set(after.map((e) => e.id)).size).toBe(after.length);
  });
});

describe("torture: search results reorder between collect and execute", () => {
  it("an id stays bound to its physical DOM node even if visual order changes, and a stale id from before a DOM rebuild never matches the wrong node", () => {
    render(`<a href="/a">Alpha</a><a href="/b">Beta</a><a href="/c">Gamma</a>`);
    const before = collect(1);
    const betaId = before[1].id;

    // Reorder by rebuilding — the common case for anything without stable
    // React keys, and the more dangerous shape: Beta's CONTENT is now at
    // a different position, so a naive "nth element" selector would grab
    // the wrong link entirely.
    document.body.innerHTML = `<a href="/c">Gamma</a><a href="/a">Alpha</a><a href="/b">Beta</a>`;
    const after = collect(2);

    const oldBetaStillExists = document.querySelector(`[data-act-id="${betaId}"]`);
    expect(oldBetaStillExists, "the stale id must not exist anywhere in the reordered DOM").toBeNull();

    // The NEW Beta element gets its own new id, correctly, at its new
    // position — nth=2 in the new order — proving the mechanism doesn't
    // accidentally alias old-position-2 (Gamma) to the stale Beta id.
    const newBeta = after.find((e) => e.text === "Beta")!;
    expect(newBeta.id).not.toBe(betaId);
  });
});

describe("torture: the canonical YouTube scenario — wrong candidate, verification catches it, recovery picks the right one", () => {
  it("reproduces the exact search -> wrong click -> verification-fails -> reread -> correct click -> verification-succeeds sequence", async () => {
    // A fake Page whose url() and evaluate() reflect whatever "page state"
    // we're currently simulating — reused from verification-engine.test.ts's
    // pattern, driving the REAL verifyUrl/verifyAction functions.
    let currentUrl = "https://youtube.com/results?search_query=x";
    const fakePage = {
      url: () => currentUrl,
      evaluate: async () => "",
    } as unknown as import("playwright").Page;

    // Step 1: agent is still on the results page (candidate #0 was a
    // non-video link — e.g. a channel page, or a "people also watched"
    // shelf link that doesn't lead to /watch).
    const firstAttempt = await verifyAction(fakePage, { type: "url", value: "/watch" });
    expect(firstAttempt.verified, "still on results — the wrong candidate must fail verification").toBe(false);

    // Step 2: recovery — the agent rereads the page (simulated by nothing
    // changing yet) and picks a DIFFERENT candidate this time, which
    // actually navigates.
    currentUrl = "https://youtube.com/watch?v=abc123";
    const secondAttempt = await verifyAction(fakePage, { type: "url", value: "/watch" });
    expect(secondAttempt.verified, "the correct candidate must pass verification").toBe(true);

    // The whole point: execution "succeeding" (the click didn't throw) was
    // never the signal that mattered — verification was.
    expect(verifyUrl(fakePage, "/watch").actual).toContain("/watch?v=abc123");
  });
});

describe("torture: a non-navigating action must NOT invalidate ids the model still holds", () => {
  it("re-collecting at the SAME generation keeps every existing id valid", () => {
    // The real bug this locks down: typing into a search box used to
    // re-collect and bump the generation, which renumbered every OTHER
    // element on the page — including the search button the model was
    // about to click next. It got STALE_ELEMENT, re-read, retried, and
    // looped. Observed live as "typed the query but never pressed Enter",
    // plus a large share of the slowness.
    render(`<input aria-label="Search" /><button>Submit</button>`);
    const before = collect(1);
    const submitId = before.find((e) => e.text === "Submit")!.id;

    // Typing changes the input's VALUE but no element's identity — so a
    // re-collection at the same generation must leave the submit button
    // reachable by the id the model already has.
    (document.querySelector("input") as HTMLInputElement).value = "tum mile";
    const after = collect(1);

    const submitAfter = after.find((e) => e.text === "Submit")!;
    expect(submitAfter.id, "the submit button's id must survive a non-navigating action").toBe(submitId);
    expect(document.querySelector(`[data-act-id="${submitId}"]`)).not.toBeNull();
  });

  it("but a real navigation DOES invalidate them — the distinction has to hold both ways", () => {
    render(`<input aria-label="Search" /><button>Submit</button>`);
    const before = collect(1);
    const submitId = before.find((e) => e.text === "Submit")!.id;

    document.body.innerHTML = `<video></video><button>Pause</button>`;
    const after = collect(2);

    expect(after.some((e) => e.id === submitId)).toBe(false);
    expect(document.querySelector(`[data-act-id="${submitId}"]`)).toBeNull();
  });
});

describe("torture: element identity must survive DOM insertion and reordering", () => {
  it("INSERTION: a new element appearing mid-page must not shift any existing element's id", () => {
    // The nastiest failure mode, and worse than STALE_ELEMENT: when ids
    // were index-derived, a lazily-inserted ad/toast/result shifted every
    // subsequent element's id by one. An id the model was holding would
    // still RESOLVE — just to a different element — so the runtime would
    // report "found it, clicked it, success" while clicking the wrong
    // thing. Silent wrong-element execution, not a visible failure.
    render(`<input aria-label="Search" /><button>Submit</button><a href="/r">Result</a>`);
    const before = collect(1);
    const searchId = before.find((e) => e.text === "Search")!.id;
    const submitId = before.find((e) => e.text === "Submit")!.id;
    const resultId = before.find((e) => e.text === "Result")!.id;

    // YouTube inserting an ad between the search box and the button.
    document.querySelector("button")!.insertAdjacentHTML("beforebegin", `<a href="/ad">Sponsored</a>`);
    const after = collect(1);

    expect(after.find((e) => e.text === "Search")!.id, "Search must keep its id").toBe(searchId);
    expect(after.find((e) => e.text === "Submit")!.id, "Submit must keep its id — this is the ad-insertion bug").toBe(submitId);
    expect(after.find((e) => e.text === "Result")!.id, "Result must keep its id").toBe(resultId);

    // And the genuinely new element gets an id of its own that collides
    // with nothing already in use.
    const adId = after.find((e) => e.text === "Sponsored")!.id;
    expect([searchId, submitId, resultId]).not.toContain(adId);
  });

  it("REORDER: moving elements around must not change any of their ids", () => {
    render(`<a href="/a">Alpha</a><a href="/b">Beta</a><a href="/c">Gamma</a>`);
    const before = collect(1);
    const ids = Object.fromEntries(before.map((e) => [e.text, e.id]));

    // Move Gamma to the front WITHOUT destroying the nodes — appendChild
    // of an existing node relocates it, which is what a client-side sort
    // or a re-prioritised results list actually does.
    const body = document.body;
    body.insertBefore(document.querySelectorAll("a")[2], body.firstChild);
    const after = collect(1);

    for (const text of ["Alpha", "Beta", "Gamma"]) {
      expect(after.find((e) => e.text === text)!.id, `${text} must keep its id across a reorder`).toBe(ids[text]);
    }
  });

  it("IDEMPOTENT: collecting twice on an unchanged DOM returns byte-identical ids", () => {
    render(`<input aria-label="Search" /><button>Go</button><a href="/x">Link</a>`);
    const first = collect(1);
    const second = collect(1);
    expect(second.map((e) => e.id)).toEqual(first.map((e) => e.id));
  });

  it("REMOVAL then INSERTION: a removed element's id is never recycled onto a different element", () => {
    // If counter restarted at 0 each pass, a new element could be handed
    // an id a surviving element still holds — the collision case.
    render(`<button>One</button><button>Two</button><button>Three</button>`);
    const before = collect(1);
    const oneId = before.find((e) => e.text === "One")!.id;
    const threeId = before.find((e) => e.text === "Three")!.id;

    document.querySelectorAll("button")[1].remove(); // drop "Two"
    document.body.insertAdjacentHTML("beforeend", `<button>Four</button>`);
    const after = collect(1);

    expect(after.find((e) => e.text === "One")!.id).toBe(oneId);
    expect(after.find((e) => e.text === "Three")!.id).toBe(threeId);

    const fourId = after.find((e) => e.text === "Four")!.id;
    expect([oneId, threeId], "the new element must not reuse a live id").not.toContain(fourId);
    // Every id on the page must still be unique.
    const allIds = after.map((e) => e.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
