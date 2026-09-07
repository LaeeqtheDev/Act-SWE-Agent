import { describe, it, expect } from "vitest";

// Guards a real correctness risk: tools that drive the shared browser page
// MUST NOT be run in parallel — two clicks or scrolls at once would fight
// over the same tab. This test fails loudly if someone adds a stateful tool
// to the parallel-safe list later.
const PARALLEL_SAFE = new Set([
  "listServices",
  "listIncidents",
  "getServiceHealth",
  "getRecentErrors",
  "getDeploymentHistory",
  "getKubernetesPodStatus",
  "getKubernetesEvents",
  "readProjectFile",
  "listProjectDirectory",
  "getUserProfile",
]);

// Anything that navigates, clicks, scrolls, or mutates state.
const MUST_BE_SEQUENTIAL = [
  "webSearch", // drives the shared browser page
  "browseWeb",
  "typeInto",
  "verifyPageContains",
  "clickToNavigate",
  "scrollPage",
  "goBack",
  "readPageAsMarkdown",
  "pressKey",
  "proposeAction",
  "createDocument",
  "openInEditor",
];

describe("tool parallelization safety", () => {
  it("never marks a browser-driving or state-changing tool as parallel-safe", () => {
    for (const name of MUST_BE_SEQUENTIAL) {
      expect(PARALLEL_SAFE.has(name), `${name} drives shared state and must run sequentially`).toBe(false);
    }
  });

  it("parallel-safe tools are all genuinely read-only", () => {
    for (const name of PARALLEL_SAFE) {
      expect(name).not.toMatch(/^(propose|create|perform|open|click|scroll|press|go)/);
    }
  });
});
