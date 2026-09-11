import { describe, it, expect } from "vitest";

// Mirrors classifyMissingElement in tools/browser.ts. Ids are embedded with
// the page generation they were collected at ("4:e3"). A generation only
// ever advances (on every collectInteractiveElements call, navigation or
// not — a React rerender or infinite-scroll growth counts too), so an id
// from an earlier generation is PROVABLY stale, not a guess.
function classify(elementId: string, currentGeneration: number): "STALE_ELEMENT" | "ELEMENT_NOT_FOUND" {
  const match = elementId.match(/^(\d+):/);
  if (!match) return "ELEMENT_NOT_FOUND";
  const idGeneration = Number(match[1]);
  return idGeneration < currentGeneration ? "STALE_ELEMENT" : "ELEMENT_NOT_FOUND";
}

describe("element staleness classification", () => {
  it("classifies an id from an earlier generation as STALE_ELEMENT", () => {
    // The exact scenario the review named: Page A collects at generation 4,
    // the page navigates (or just rerenders), generation advances to 5 —
    // the old "4:e3" must never resolve to whatever e3 is on the new page.
    expect(classify("4:e3", 5)).toBe("STALE_ELEMENT");
  });

  it("classifies a well-formed but never-real id as ELEMENT_NOT_FOUND, not STALE_ELEMENT", () => {
    // Same current generation, but this id was never returned by a real
    // collection — the model hallucinated it. Different failure, different
    // recovery: re-reading the page won't help if it was never real.
    expect(classify("5:e99", 5)).toBe("ELEMENT_NOT_FOUND");
  });

  it("classifies a malformed id (no generation prefix at all) as ELEMENT_NOT_FOUND", () => {
    expect(classify("e3", 5)).toBe("ELEMENT_NOT_FOUND");
    expect(classify("not-an-id", 5)).toBe("ELEMENT_NOT_FOUND");
  });

  it("never misclassifies a CURRENT-generation id as stale", () => {
    // An id from the page's most recent collection must resolve normally —
    // if the boundingBox lookup fails for one of these, that's a real
    // ELEMENT_NOT_FOUND, not staleness.
    expect(classify("5:e0", 5)).toBe("ELEMENT_NOT_FOUND");
  });
});
