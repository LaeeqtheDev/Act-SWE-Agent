// The state machine for AgentAction, kept as pure functions so the rules
// governing "is it safe to run this" are testable without a database and
// can never silently drift from what performAction actually enforces.
//
//   pending -> approved -> executing -> succeeded
//                                    \-> failed -> approved (retry, same id)
//                                    \-> unknown
//   pending -> rejected
//   pending -> expired
//
// UNKNOWN exists because a crash or network timeout between "the external
// write happened" and "we recorded that" must not collapse into either
// FAILED (retrying could duplicate a real submission) or SUCCEEDED
// (declaring victory on a write that never happened). Only a human or a
// fresh verification can resolve it — the runtime never guesses.

export type ActionStatus =
  | "pending"
  | "approved"
  | "executing"
  | "succeeded"
  | "failed"
  | "unknown"
  | "rejected"
  | "expired";

// A pending approval that's sat untouched this long is treated as expired
// rather than staying approvable indefinitely — a month-old "approve this
// job application" shouldn't fire the moment someone finally clicks it.
export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// If a row has been "executing" longer than this, the process that claimed
// it is presumed dead (crashed, killed, lost network) rather than genuinely
// still working — real browser/API actions finish in seconds, not minutes.
export const EXECUTION_STUCK_MS = 5 * 60 * 1000; // 5 min

export function isApprovalExpired(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() > APPROVAL_TTL_MS;
}

export function isExecutionStuck(executingSince: Date, now: Date = new Date()): boolean {
  return now.getTime() - executingSince.getTime() > EXECUTION_STUCK_MS;
}

// Only a row genuinely in "approved" may begin executing. Every other
// status — including "executing" itself — must be refused, which is what
// makes a concurrent double-click or a duplicate job-queue delivery unable
// to run the same write twice: the atomic claim (approved -> executing) in
// agent.ts either succeeds once or fails for everyone else.
export function canExecute(status: ActionStatus): boolean {
  return status === "approved";
}

// Only a DEFINITE failure is safe to retry blindly, because we know for
// certain the write never took effect. UNKNOWN must never retry blindly —
// it needs verification first, to find out whether the original attempt
// actually went through before deciding whether running it again would
// duplicate something. SUCCEEDED, REJECTED, and EXPIRED are all dead ends
// that require a fresh proposal, not a retry of this one.
export function canRetry(status: ActionStatus): boolean {
  return status === "failed";
}

export function isTerminal(status: ActionStatus): boolean {
  return status === "succeeded" || status === "rejected" || status === "expired";
}

export function nextStatusAfterExecution(outcome: "success" | "failure" | "unknown"): ActionStatus {
  if (outcome === "success") return "succeeded";
  if (outcome === "failure") return "failed";
  return "unknown";
}

// A human-readable reason for why an execute/retry attempt was refused —
// this is what a caller actually shows the user or the agent, so the
// refusal is explained rather than just a generic error.
export function explainRefusal(status: ActionStatus): string {
  switch (status) {
    case "executing":
      return "This action is already running — a duplicate request, or you clicked twice. Not running it again.";
    case "succeeded":
      return "This action already succeeded. Running it again could duplicate a real write — propose a new action instead if you need to do this again.";
    case "unknown":
      return "The last attempt's outcome is unknown — it may have succeeded or failed, and retrying blindly risks a duplicate. Verify what actually happened before deciding.";
    case "rejected":
      return "This action was rejected and can't be executed.";
    case "expired":
      return "This approval expired before it ran. Propose it again if you still want it done.";
    case "pending":
      return "This action hasn't been approved yet.";
    case "failed":
      return "This action failed and can be retried.";
    case "approved":
      return "Ready to execute.";
  }
}
