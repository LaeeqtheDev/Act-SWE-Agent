import { describe, it, expect } from "vitest";
import { JSDOM } from "jsdom";

// Not a product test — a proof that the tests added alongside the fix
// would actually have CAUGHT the bug, rather than passing vacuously
// against both implementations. Reproduces the OLD index-derived
// assignment and asserts it fails the same scenario the real collector
// now passes.
function oldIndexDerivedCollect(generation = 1) {
  const els = Array.from(document.querySelectorAll("a, button, input"));
  const results: { id: string; text: string }[] = [];
  let counter = 0;
  for (const el of els) {
    const label = el.getAttribute("aria-label") || el.textContent?.trim() || "";
    if (!label) continue;
    const id = `${generation}:e${counter++}`; // the bug: position, not identity
    el.setAttribute("data-act-id", id);
    results.push({ id, text: label });
  }
  return results;
}

describe("regression proof: the old implementation really did mis-assign ids", () => {
  it("an inserted ad silently repointed a held id at the wrong element", () => {
    const dom = new JSDOM(
      `<!DOCTYPE html><body><input aria-label="Search" /><button>Submit</button><a href="/r">Result</a></body>`
    );
    (globalThis as unknown as { document: Document }).document = dom.window.document;

    const before = oldIndexDerivedCollect(1);
    const submitId = before.find((e) => e.text === "Submit")!.id;

    document.querySelector("button")!.insertAdjacentHTML("beforebegin", `<a href="/ad">Sponsored</a>`);
    const after = oldIndexDerivedCollect(1);

    // Submit's id CHANGED under the old scheme...
    expect(after.find((e) => e.text === "Submit")!.id).not.toBe(submitId);
    // ...and the id the model was still holding now resolves to the ad.
    // This is the silent wrong-element execution: it resolves fine, it
    // just points somewhere else entirely.
    expect(after.find((e) => e.id === submitId)!.text).toBe("Sponsored");
  });
});
