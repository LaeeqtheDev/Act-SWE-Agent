import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkDemoRateLimit } from "../demo.js";

describe("checkDemoRateLimit", () => {
  it("allows requests up to the configured limit, then blocks", () => {
    const ip = `test-ip-${Math.random()}`; // unique per test run to avoid cross-test state
    const limit = Number(process.env.DEMO_RATE_LIMIT) || 6;

    for (let i = 0; i < limit; i++) {
      const result = checkDemoRateLimit(ip);
      expect(result.allowed).toBe(true);
    }

    const blocked = checkDemoRateLimit(ip);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("tracks separate IPs independently", () => {
    const ipA = `ip-a-${Math.random()}`;
    const ipB = `ip-b-${Math.random()}`;

    checkDemoRateLimit(ipA);
    checkDemoRateLimit(ipA);
    const bFirstCall = checkDemoRateLimit(ipB);

    // IP B's first call should show it hasn't been touched by IP A's usage
    expect(bFirstCall.allowed).toBe(true);
    expect(bFirstCall.remaining).toBe((Number(process.env.DEMO_RATE_LIMIT) || 6) - 1);
  });
});
