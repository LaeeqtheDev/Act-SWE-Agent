import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// Same pattern as usage.test.ts: the REAL performAction/retryAction logic
// runs here against a fully controllable mocked Prisma client — not a
// reimplementation, and not only the pure state-machine functions (those
// are covered separately in action-lifecycle.test.ts). This is what
// exercises the atomic claim, the concurrency guard, and the crash/UNKNOWN
// path for real.

const prismaMock = mockDeep<PrismaClient>();

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(() => prismaMock),
}));

// performAction's dependencies outside the DB are mocked to no-ops/fixed
// results — this test is about the STATE MACHINE, not about actually
// restarting a Kubernetes deployment.
vi.mock("../k8s.js", () => ({
  restartDeployment: vi.fn(async () => ({ success: true })),
}));
vi.mock("../chat.js", () => ({
  resumeAfterAction: vi.fn(async () => {}),
}));
vi.mock("../runs.js", () => ({
  recordEvent: vi.fn(async () => {}),
}));
vi.mock("../agent-incidents.js", () => ({
  detectToolFailure: vi.fn(async () => {}),
  reportAgentIncident: vi.fn(async () => {}),
}));
vi.mock("../tools/browser.js", () => ({
  isSessionCancelled: vi.fn(() => false),
  performBrowserAction: vi.fn(async () => ({ success: true })),
  performFormFill: vi.fn(async () => ({ success: true, filled: 1, submitted: false })),
}));
vi.mock("../metrics.js", () => ({
  agentActionsTotal: { inc: vi.fn() },
  toolCallsTotal: { inc: vi.fn() },
}));

const { performAction, retryAction } = await import("../agent.js");

function fakeAction(overrides: Partial<{
  id: string;
  status: string;
  type: string;
  conversationId: string | null;
  incidentId: string | null;
  executingSince: Date | null;
  createdAt: Date;
  attempts: number;
}> = {}) {
  return {
    id: "act_1",
    userId: null,
    incidentId: "incident_1",
    conversationId: null,
    type: "restart_pod",
    status: "approved",
    summary: null,
    confidence: null,
    evidence: null,
    result: null,
    executingSince: null,
    attempts: 0,
    createdAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

describe("performAction: refusal paths", () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  it("refuses a PENDING action — nothing has been approved yet", async () => {
    prismaMock.agentAction.findUnique.mockResolvedValue(fakeAction({ status: "pending" }) as never);
    await expect(performAction("act_1")).rejects.toThrow(/hasn.t been approved/i);
  });

  it("refuses an already-SUCCEEDED action — running it again could duplicate a real write", async () => {
    prismaMock.agentAction.findUnique.mockResolvedValue(fakeAction({ status: "succeeded" }) as never);
    await expect(performAction("act_1")).rejects.toThrow(/already succeeded/i);
  });

  it("refuses a REJECTED action", async () => {
    prismaMock.agentAction.findUnique.mockResolvedValue(fakeAction({ status: "rejected" }) as never);
    await expect(performAction("act_1")).rejects.toThrow(/rejected/i);
  });

  it("refuses an EXPIRED action", async () => {
    prismaMock.agentAction.findUnique.mockResolvedValue(fakeAction({ status: "expired" }) as never);
    await expect(performAction("act_1")).rejects.toThrow(/expired/i);
  });

  it("CONCURRENT EXECUTION: a second call cannot claim a row the first call already claimed", async () => {
    // The exact race the review named: two requests reach performAction for
    // the same action at nearly the same time. Both read status=approved.
    // Only ONE atomic updateMany can actually match and increment — that's
    // what this simulates by having the claim return count 0.
    prismaMock.agentAction.findUnique.mockResolvedValueOnce(fakeAction({ status: "approved" }) as never);
    prismaMock.agentAction.updateMany.mockResolvedValue({ count: 0 }); // someone else already claimed it
    prismaMock.agentAction.findUnique.mockResolvedValueOnce(fakeAction({ status: "executing" }) as never); // fresh read for the error message

    await expect(performAction("act_1")).rejects.toThrow(/already running/i);
    // The claim must have been ATTEMPTED with a status-filtered where — not
    // an unconditional update, which is what would make the race possible
    // in the first place.
    expect(prismaMock.agentAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "act_1", status: "approved" }) })
    );
  });

  it("PROCESS RESTART / crash recovery: a long-stuck EXECUTING row becomes UNKNOWN, not silently re-run", async () => {
    // The worst-case scenario named directly in the ticket: a worker
    // claimed the row, the external write may have gone through, then the
    // process died before recording the outcome. On the NEXT call, this
    // must reclassify to UNKNOWN and refuse — never blindly execute again.
    const longAgo = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago, well past the stuck threshold
    prismaMock.agentAction.findUnique.mockResolvedValue(fakeAction({ status: "executing", executingSince: longAgo }) as never);

    await expect(performAction("act_1")).rejects.toThrow(/unknown|not.*approved/i);
    // The reclassification to "unknown" must actually have been persisted,
    // not just reasoned about in memory.
    expect(prismaMock.agentAction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "unknown" }) })
    );
  });

  it("a RECENTLY-claimed executing row is treated as a genuine concurrent run, not reclassified", async () => {
    const justNow = new Date(Date.now() - 5000); // 5 seconds ago — nowhere near stuck
    prismaMock.agentAction.findUnique.mockResolvedValue(fakeAction({ status: "executing", executingSince: justNow }) as never);

    await expect(performAction("act_1")).rejects.toThrow(/already running/i);
    // Must NOT have been reclassified — it's still genuinely in flight.
    expect(prismaMock.agentAction.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "unknown" }) })
    );
  });
});

describe("performAction: successful execution", () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  it("claims the row, executes, and records SUCCEEDED with the real result", async () => {
    prismaMock.agentAction.findUnique.mockResolvedValueOnce(fakeAction({ status: "approved" }) as never);
    prismaMock.agentAction.updateMany.mockResolvedValue({ count: 1 }); // claim succeeds
    prismaMock.incident.findUnique.mockResolvedValue({ id: "incident_1", service: { name: "orders-api" } } as never);
    prismaMock.agentAction.update.mockResolvedValue(fakeAction({ status: "succeeded" }) as never);

    await performAction("act_1");

    expect(prismaMock.agentAction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "succeeded" }) })
    );
  });
});

describe("retryAction", () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  it("refuses to retry a SUCCEEDED action", async () => {
    prismaMock.agentAction.findUnique.mockResolvedValue(fakeAction({ status: "succeeded" }) as never);
    await expect(retryAction("act_1")).rejects.toThrow(/already succeeded/i);
  });

  it("refuses to retry an UNKNOWN action — the earlier attempt's outcome isn't verified", async () => {
    prismaMock.agentAction.findUnique.mockResolvedValue(fakeAction({ status: "unknown" }) as never);
    await expect(retryAction("act_1")).rejects.toThrow(/unknown|unverified/i);
  });

  it("allows retrying a FAILED action", async () => {
    prismaMock.agentAction.findUnique
      .mockResolvedValueOnce(fakeAction({ status: "failed" }) as never) // retryAction's own lookup
      .mockResolvedValueOnce(fakeAction({ status: "approved" }) as never); // performAction's lookup after the transition
    prismaMock.agentAction.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.incident.findUnique.mockResolvedValue({ id: "incident_1", service: { name: "orders-api" } } as never);
    prismaMock.agentAction.update.mockResolvedValue(fakeAction({ status: "succeeded" }) as never);

    await retryAction("act_1");

    // failed -> approved must have happened before performAction claims it.
    expect(prismaMock.agentAction.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "act_1" }, data: { status: "approved" } })
    );
  });

  it("REUSES THE SAME actionId across a retry — never creates a new row", async () => {
    // This is the mechanism the ticket cares about most: a retry must be
    // recognisable as attempt 2 of the SAME logical action, not a fresh,
    // unrelated one that the system can't connect back to the original.
    prismaMock.agentAction.findUnique
      .mockResolvedValueOnce(fakeAction({ status: "failed" }) as never) // retryAction's own lookup
      .mockResolvedValueOnce(fakeAction({ status: "approved" }) as never); // performAction's lookup, after failed -> approved
    prismaMock.agentAction.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.incident.findUnique.mockResolvedValue({ id: "incident_1", service: { name: "orders-api" } } as never);
    prismaMock.agentAction.update.mockResolvedValue(fakeAction({ status: "succeeded" }) as never);

    await retryAction("act_1");

    expect(prismaMock.agentAction.create).not.toHaveBeenCalled();
    // Every update touching this retry must reference the original id.
    for (const call of prismaMock.agentAction.update.mock.calls) {
      expect(call[0].where).toEqual({ id: "act_1" });
    }
  });
});

describe("torture: 10 simultaneous claims on the same action", () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  it("exactly ONE of ten concurrent performAction calls claims the row — the other nine are refused", async () => {
    // A fixed mockResolvedValue can't actually prove this — it would
    // return count:1 to every caller, which is precisely the bug this
    // exists to rule out. The mock here is STATEFUL: it behaves the way
    // Postgres actually behaves under `UPDATE ... WHERE status =
    // 'approved'` — the row can only be in "approved" once, so only the
    // first conditional update to reach it can possibly match.
    let claimed = false;
    prismaMock.agentAction.findUnique.mockImplementation(async () =>
      fakeAction({ status: claimed ? "executing" : "approved" }) as never
    );
    prismaMock.agentAction.updateMany.mockImplementation(async () => {
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    });
    prismaMock.incident.findUnique.mockResolvedValue({ id: "incident_1", service: { name: "orders-api" } } as never);
    prismaMock.agentAction.update.mockResolvedValue(fakeAction({ status: "succeeded" }) as never);

    const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => performAction("act_1")));

    const succeeded = attempts.filter((a) => a.status === "fulfilled");
    const refused = attempts.filter((a) => a.status === "rejected");

    expect(succeeded.length, "exactly one call must have actually claimed and executed").toBe(1);
    expect(refused.length, "the other nine must be refused, not silently ignored or duplicated").toBe(9);
    for (const r of refused) {
      if (r.status === "rejected") expect(String(r.reason)).toMatch(/already running/i);
    }
  });
});

describe("torture: thrown exception during execution becomes UNKNOWN, never FAILED or an automatic retry", () => {
  beforeEach(() => {
    mockReset(prismaMock);
  });

  it("a network/timeout-style throw mid-execution is recorded as UNKNOWN, not FAILED", async () => {
    // The exact case the ticket names: the write may have reached the
    // external service before the connection dropped. We genuinely don't
    // know, so FAILED (implying safe-to-retry) would be a lie, and so
    // would silently swallowing it as success.
    prismaMock.agentAction.findUnique.mockResolvedValue(fakeAction({ status: "approved", type: "restart_pod" }) as never);
    prismaMock.agentAction.updateMany.mockResolvedValue({ count: 1 });
    // No incident found -> incidentId lookup throws inside dispatchAction,
    // simulating an unexpected failure mid-flight rather than a clean
    // {success:false} the executor itself returned.
    prismaMock.incident.findUnique.mockResolvedValue(null);

    await expect(performAction("act_1")).rejects.toThrow(/incident not found/i);

    expect(prismaMock.agentAction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "unknown" }) })
    );
    // Must NEVER be recorded as "failed" for this case — that would make a
    // caller believe blind retry is safe when it genuinely isn't known.
    expect(prismaMock.agentAction.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) })
    );
  });

  it("an UNKNOWN action is never automatically retried by anything in this flow", async () => {
    // Direct proof that reaching UNKNOWN doesn't get looped back into
    // execution — canRetry (already unit-tested) is the actual gate;
    // this confirms performAction/retryAction both honour it end to end.
    prismaMock.agentAction.findUnique.mockResolvedValue(fakeAction({ status: "unknown" }) as never);
    await expect(retryAction("act_1")).rejects.toThrow(/unknown/i);
    expect(prismaMock.agentAction.updateMany).not.toHaveBeenCalled();
  });
});
