import { describe, it, expect } from "vitest";
import {
  canExecute,
  canRetry,
  isTerminal,
  isApprovalExpired,
  isExecutionStuck,
  nextStatusAfterExecution,
  explainRefusal,
  APPROVAL_TTL_MS,
  EXECUTION_STUCK_MS,
  type ActionStatus,
} from "../action-lifecycle.js";

const ALL_STATUSES: ActionStatus[] = ["pending", "approved", "executing", "succeeded", "failed", "unknown", "rejected", "expired"];

describe("canExecute", () => {
  it("only APPROVED may begin executing", () => {
    expect(canExecute("approved")).toBe(true);
    for (const s of ALL_STATUSES.filter((s) => s !== "approved")) {
      expect(canExecute(s), `${s} must not be executable`).toBe(false);
    }
  });
});

describe("canRetry", () => {
  it("only a definite FAILURE is safe to retry blindly", () => {
    expect(canRetry("failed")).toBe(true);
  });

  it("UNKNOWN must never retry blindly — the earlier attempt's outcome is genuinely unverified", () => {
    expect(canRetry("unknown")).toBe(false);
  });

  it("SUCCEEDED must never retry — that would risk a duplicate write", () => {
    expect(canRetry("succeeded")).toBe(false);
  });

  it("REJECTED and EXPIRED are dead ends, not retryable", () => {
    expect(canRetry("rejected")).toBe(false);
    expect(canRetry("expired")).toBe(false);
  });

  it("PENDING and APPROVED aren't retries — they haven't failed yet", () => {
    expect(canRetry("pending")).toBe(false);
    expect(canRetry("approved")).toBe(false);
  });
});

describe("isTerminal", () => {
  it("SUCCEEDED, REJECTED, and EXPIRED are terminal — nothing more happens to them", () => {
    expect(isTerminal("succeeded")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("expired")).toBe(true);
  });

  it("FAILED and UNKNOWN are NOT terminal — both have a real path forward (retry, or verify-then-decide)", () => {
    expect(isTerminal("failed")).toBe(false);
    expect(isTerminal("unknown")).toBe(false);
  });
});

describe("nextStatusAfterExecution", () => {
  it("maps success/failure/unknown to the right terminal-or-recoverable state", () => {
    expect(nextStatusAfterExecution("success")).toBe("succeeded");
    expect(nextStatusAfterExecution("failure")).toBe("failed");
    expect(nextStatusAfterExecution("unknown")).toBe("unknown");
  });
});

describe("isApprovalExpired", () => {
  it("is not expired immediately after creation", () => {
    expect(isApprovalExpired(new Date(), new Date())).toBe(false);
  });

  it("is not expired just under the TTL", () => {
    const created = new Date(Date.now() - (APPROVAL_TTL_MS - 1000));
    expect(isApprovalExpired(created)).toBe(false);
  });

  it("is expired just over the TTL", () => {
    const created = new Date(Date.now() - (APPROVAL_TTL_MS + 1000));
    expect(isApprovalExpired(created)).toBe(true);
  });
});

describe("isExecutionStuck", () => {
  it("a row that just started executing is not stuck", () => {
    expect(isExecutionStuck(new Date())).toBe(false);
  });

  it("a row executing longer than the stuck threshold IS stuck — the crashed-worker case", () => {
    const since = new Date(Date.now() - (EXECUTION_STUCK_MS + 1000));
    expect(isExecutionStuck(since)).toBe(true);
  });
});

describe("explainRefusal", () => {
  it("gives a distinct, non-empty reason for every non-executable status", () => {
    const reasons = new Set<string>();
    for (const s of ALL_STATUSES) {
      const reason = explainRefusal(s);
      expect(reason.length).toBeGreaterThan(0);
      reasons.add(reason);
    }
    // Every status should read differently — a generic "can't do that" for
    // every case would defeat the point of having named states at all.
    expect(reasons.size).toBe(ALL_STATUSES.length);
  });
});
