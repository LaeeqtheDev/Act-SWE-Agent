import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// This is deliberately NOT a real integration test against a live database
// (see docs/ARCHITECTURE.md for why that is a separate, bigger effort) — but it's
// a real step up from a pure-function unit test: the actual usage-limit
// business logic in usage.ts runs for real here, against a fully
// controllable mocked Prisma client, catching bugs a pure-function test
// can't (an off-by-one in the limit check, wrong plan resolved, period
// reset happening at the wrong time).

const prismaMock = mockDeep<PrismaClient>();

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}));

// Imported AFTER the mock is set up so usage.ts's `new PrismaClient()`
// resolves to prismaMock.
const { checkAndIncrementUsage, UsageLimitError, getUsage } = await import("../usage.js");

function fakeUser(overrides: Partial<{ tasksUsed: number; plan: string; periodStart: Date; email: string | null }> = {}) {
  return {
    id: "user_123",
    email: null,
    plan: "free",
    tasksUsed: 0,
    periodStart: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe("checkAndIncrementUsage", () => {
  beforeEach(() => {
    mockReset(prismaMock);
    process.env.HOSTED_MODE = "false"; // skip the Clerk email-backfill path for these tests
  });

  it("creates a new free-plan user on first use and allows the task", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(fakeUser());
    prismaMock.user.update.mockResolvedValue(fakeUser({ tasksUsed: 1 }));

    const result = await checkAndIncrementUsage("user_123");

    expect(result.plan).toBe("free");
    expect(result.limit).toBe(10);
    expect(prismaMock.user.create).toHaveBeenCalledWith({ data: { id: "user_123", email: undefined } });
  });

  it("throws UsageLimitError exactly at the free-tier limit, not one early or late", async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser({ tasksUsed: 10 })); // already at the limit

    await expect(checkAndIncrementUsage("user_123")).rejects.toThrow(UsageLimitError);
    // The increment must never be attempted once the limit is hit.
    expect(prismaMock.user.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { tasksUsed: { increment: 1 } } }));
  });

  it("allows the task at 9/10 (one below the limit)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser({ tasksUsed: 9 }));
    prismaMock.user.update.mockResolvedValue(fakeUser({ tasksUsed: 10 }));

    const result = await checkAndIncrementUsage("user_123");
    expect(result.tasksUsed).toBe(10);
  });

  it("gives Pro accounts the 500 limit, not the free 10", async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser({ plan: "pro", tasksUsed: 50 }));
    prismaMock.user.update.mockResolvedValue(fakeUser({ plan: "pro", tasksUsed: 51 }));

    const result = await checkAndIncrementUsage("user_123");
    expect(result.limit).toBe(500);
    expect(result.plan).toBe("pro");
  });

  it("resets tasksUsed to 0 once the 30-day period has elapsed", async () => {
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
    prismaMock.user.findUnique.mockResolvedValue(fakeUser({ tasksUsed: 10, periodStart: staleDate }));
    // First update call is the period reset, second is the increment.
    prismaMock.user.update
      .mockResolvedValueOnce(fakeUser({ tasksUsed: 0, periodStart: new Date() }))
      .mockResolvedValueOnce(fakeUser({ tasksUsed: 1, periodStart: new Date() }));

    const result = await checkAndIncrementUsage("user_123");

    // The reset should have made room for this task, not still be blocked
    // by the old (stale) tasksUsed count of 10.
    expect(result.tasksUsed).toBe(1);
  });
});

describe("getUsage", () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  it("returns free-tier defaults for a user that doesn't exist yet", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const result = await getUsage("never_seen_before");
    expect(result).toEqual({ tasksUsed: 0, limit: 10, plan: "free" });
  });

  it("reflects the real stored usage for an existing user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(fakeUser({ tasksUsed: 7, plan: "pro" }));
    const result = await getUsage("user_123");
    expect(result).toEqual({ tasksUsed: 7, limit: 500, plan: "pro" });
  });
});
