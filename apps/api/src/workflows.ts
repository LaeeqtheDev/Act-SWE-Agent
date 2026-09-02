import { PrismaClient } from "@prisma/client";
import cron from "node-cron";
import { createConversation, sendMessage } from "./chat.js";
import { createNotification } from "./notifications.js";
import { workflowRunsTotal } from "./metrics.js";

const prisma = new PrismaClient();

// A workflow runs the EXACT same chat engine as a real conversation — same
// tools, same permission gate on any write. The only difference from a
// person typing is what triggers it (a cron schedule instead of a click).
// All runs of one workflow share a single ongoing conversation, so the
// agent has real continuity across scheduled runs — the tenth run of "check
// LinkedIn for messages" still remembers what the first nine found.

const scheduledTasks = new Map<string, cron.ScheduledTask>();

export async function runWorkflowNow(workflowId: string): Promise<void> {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow || !workflow.enabled) return;

  const run = await prisma.workflowRun.create({ data: { workflowId, status: "running" } });

  try {
    let conversationId = workflow.conversationId ?? undefined;
    if (!conversationId) {
      const conv = await createConversation(`Workflow: ${workflow.name}`, workflow.userId ?? undefined);
      conversationId = conv.id;
      await prisma.workflow.update({ where: { id: workflow.id }, data: { conversationId } });
    }

    const result = await sendMessage(conversationId, workflow.prompt, workflow.userId ?? undefined);

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "completed", result: result.reply.slice(0, 2000), completedAt: new Date() },
    });
    workflowRunsTotal.inc({ status: "completed" });
    await prisma.workflow.update({ where: { id: workflow.id }, data: { lastRunAt: new Date(), consecutiveFailures: 0 } });

    if (workflow.notifyOnRun) {
      await createNotification(`Workflow finished: ${workflow.name}`, result.reply, {
        userId: workflow.userId ?? undefined,
        link: "/agent",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "failed", result: message, completedAt: new Date() },
    });
    workflowRunsTotal.inc({ status: "failed" });

    // Three failures in a row and it's not worth quietly retrying on
    // schedule forever — a bad prompt or a dead selector will just fail
    // the same way every time. Auto-disable and say so clearly, rather
    // than a workflow silently failing on repeat indefinitely.
    const consecutiveFailures = workflow.consecutiveFailures + 1;
    const shouldDisable = consecutiveFailures >= 3;
    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { lastRunAt: new Date(), consecutiveFailures, ...(shouldDisable ? { enabled: false } : {}) },
    });
    if (shouldDisable) unscheduleWorkflow(workflow.id);

    if (workflow.notifyOnRun || shouldDisable) {
      await createNotification(
        shouldDisable ? `Workflow disabled after 3 failures: ${workflow.name}` : `Workflow failed: ${workflow.name}`,
        shouldDisable
          ? `This kept failing the same way, so it's been turned off automatically: ${message}. Fix the prompt or check what it needs, then re-enable it.`
          : message,
        { userId: workflow.userId ?? undefined, link: "/workflows" }
      );
    }
  }
}

export function scheduleWorkflow(workflow: { id: string; cron: string; enabled: boolean }): void {
  unscheduleWorkflow(workflow.id);
  if (!workflow.enabled) return;
  if (!cron.validate(workflow.cron)) {
    console.error(`[workflows] invalid cron expression for workflow ${workflow.id}: "${workflow.cron}" — not scheduled`);
    return;
  }
  const task = cron.schedule(workflow.cron, () => {
    runWorkflowNow(workflow.id).catch((err) => console.error(`[workflows] run failed for ${workflow.id}:`, err));
  });
  scheduledTasks.set(workflow.id, task);
}

export function unscheduleWorkflow(id: string): void {
  const existing = scheduledTasks.get(id);
  if (existing) {
    existing.stop();
    scheduledTasks.delete(id);
  }
}

// Called once at server startup — picks up every enabled workflow already
// in the database and schedules it, so restarting the API doesn't silently
// drop anyone's automations.
export async function initScheduler(): Promise<void> {
  const workflows = await prisma.workflow.findMany({ where: { enabled: true } });
  for (const w of workflows) scheduleWorkflow(w);
  console.log(`[workflows] scheduled ${workflows.length} active workflow(s)`);
}

export async function listWorkflows(userId?: string) {
  return prisma.workflow.findMany({
    where: userId ? { userId } : { userId: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function createWorkflow(opts: { name: string; prompt: string; cron: string; notifyOnRun?: boolean; userId?: string }) {
  const workflow = await prisma.workflow.create({
    data: {
      name: opts.name,
      prompt: opts.prompt,
      cron: opts.cron,
      notifyOnRun: opts.notifyOnRun ?? true,
      userId: opts.userId,
    },
  });
  scheduleWorkflow(workflow);
  return workflow;
}

export async function updateWorkflow(id: string, opts: Partial<{ name: string; prompt: string; cron: string; enabled: boolean; notifyOnRun: boolean }>) {
  const workflow = await prisma.workflow.update({ where: { id }, data: opts });
  scheduleWorkflow(workflow);
  return workflow;
}

export async function deleteWorkflow(id: string) {
  unscheduleWorkflow(id);
  await prisma.workflowRun.deleteMany({ where: { workflowId: id } });
  await prisma.workflow.delete({ where: { id } });
}

export async function listWorkflowRuns(workflowId: string) {
  return prisma.workflowRun.findMany({ where: { workflowId }, orderBy: { startedAt: "desc" }, take: 20 });
}
