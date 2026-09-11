import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// A structured event log for what the agent actually did during one run —
// a chat turn or a workflow execution. Events are the source of truth;
// formatTimeline below only ever RENDERS them, never generates them, so the
// pretty trace can never drift from what actually happened.
//
// Every write here is best-effort. Observability must never slow down or
// break the agent work it's observing — a failed event write is logged and
// swallowed, never thrown.

export type RunEventType =
  | "RUN_STARTED"
  | "AGENT_STEP"
  | "TOOL_STARTED"
  | "TOOL_COMPLETED"
  | "VERIFICATION"
  | "APPROVAL"
  | "RETRY"
  | "RUN_COMPLETED"
  | "RUN_FAILED";

export interface RunEventInput {
  runId: string;
  type: RunEventType;
  tool?: string;
  durationMs?: number;
  status?: "SUCCESS" | "FAILED";
  failureReason?: string;
  note?: string;
}

export async function startRun(conversationId?: string, userId?: string): Promise<string> {
  const run = await prisma.agentRun.create({ data: { conversationId, userId } });
  await recordEvent({ runId: run.id, type: "RUN_STARTED" });
  return run.id;
}

export async function recordEvent(input: RunEventInput): Promise<void> {
  await prisma.runEvent
    .create({
      data: {
        runId: input.runId,
        type: input.type,
        tool: input.tool,
        durationMs: input.durationMs,
        status: input.status,
        failureReason: input.failureReason,
        note: input.note,
      },
    })
    .catch((err: unknown) => console.error("[runs] failed to record event:", err instanceof Error ? err.message : err));
}

export async function completeRun(runId: string, status: "completed" | "failed"): Promise<void> {
  await prisma.agentRun
    .update({ where: { id: runId }, data: { completedAt: new Date(), status } })
    .catch(() => {});
  await recordEvent({ runId, type: status === "completed" ? "RUN_COMPLETED" : "RUN_FAILED" });
}

interface TimelineEvent {
  timestamp: Date;
  type: RunEventType;
  tool?: string | null;
  durationMs?: number | null;
  status?: string | null;
  failureReason?: string | null;
  note?: string | null;
}

// Pure — no DB, no I/O — so it's testable directly against a hand-built
// event list rather than only through a live database. getRunTimeline below
// is the thin, untested-by-design wrapper that fetches real events and
// calls this.
export function formatTimeline(startedAt: Date, events: TimelineEvent[]): string {
  const lines: string[] = [];
  const elapsed = (t: Date) => {
    const s = Math.max(0, Math.round((t.getTime() - startedAt.getTime()) / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  for (const e of events) {
    const ts = elapsed(e.timestamp);
    switch (e.type) {
      case "RUN_STARTED":
        lines.push(`${ts}  REQUEST RECEIVED`);
        break;
      case "AGENT_STEP":
        lines.push(`${ts}  AGENT STEP${e.durationMs ? ` (${e.durationMs}ms)` : ""}`);
        break;
      case "TOOL_STARTED":
        lines.push(`${ts}  TOOL \u2192 ${e.tool}`);
        break;
      case "TOOL_COMPLETED":
        lines.push(
          `${ts}  TOOL \u2190 ${e.tool} ${e.status === "FAILED" ? "FAILED" : "done"}${e.durationMs ? ` (${e.durationMs}ms)` : ""}`
        );
        break;
      case "VERIFICATION":
        lines.push(`${ts}  VERIFICATION \u2192 ${e.status ?? "UNKNOWN"}${e.failureReason ? `\n       reason: ${e.failureReason}` : ""}`);
        break;
      case "APPROVAL":
        lines.push(`${ts}  ${e.note ?? "APPROVAL"}`);
        break;
      case "RETRY":
        lines.push(`${ts}  RETRY${e.note ? ` \u2014 ${e.note}` : ""}`);
        break;
      case "RUN_COMPLETED":
        lines.push(`\nSTATUS: COMPLETED`);
        break;
      case "RUN_FAILED":
        lines.push(`\nSTATUS: FAILED`);
        break;
    }
  }
  return lines.join("\n");
}

export async function getRunTimeline(runId: string): Promise<{ run: { id: string; status: string; startedAt: Date; completedAt: Date | null }; text: string; events: TimelineEvent[] } | null> {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { events: { orderBy: { timestamp: "asc" } } },
  });
  if (!run) return null;

  const events: TimelineEvent[] = run.events.map((e: { timestamp: Date; type: string; tool: string | null; durationMs: number | null; status: string | null; failureReason: string | null; note: string | null }) => ({
    timestamp: e.timestamp,
    type: e.type as RunEventType,
    tool: e.tool,
    durationMs: e.durationMs,
    status: e.status,
    failureReason: e.failureReason,
    note: e.note,
  }));

  return {
    run: { id: run.id, status: run.status, startedAt: run.startedAt, completedAt: run.completedAt },
    text: formatTimeline(run.startedAt, events),
    events,
  };
}
