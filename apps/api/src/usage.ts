import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Only ever called in hosted mode, keyed by Clerk user id. Self-hosted /
// BYOK usage never calls into this file at all — see index.ts, where these
// checks are skipped entirely when HOSTED_MODE isn't "true".

const FREE_TASK_LIMIT = 10;
const PRO_TASK_LIMIT = 500;
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, rolling from first use

export class UsageLimitError extends Error {}

function limitFor(plan: string) {
  return plan === "pro" ? PRO_TASK_LIMIT : FREE_TASK_LIMIT;
}

async function getOrCreateUser(userId: string, email?: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return existing;
  return prisma.user.create({ data: { id: userId, email } });
}

// A "task" is one chat turn or one incident investigation. Call this BEFORE
// doing the actual (expensive, token-costing) work — it throws
// UsageLimitError if the caller is out of tasks for this period, so the
// caller never even reaches the AI provider.
export async function checkAndIncrementUsage(userId: string, email?: string) {
  let user = await getOrCreateUser(userId, email);

  if (Date.now() - user.periodStart.getTime() > PERIOD_MS) {
    user = await prisma.user.update({ where: { id: userId }, data: { tasksUsed: 0, periodStart: new Date() } });
  }

  const limit = limitFor(user.plan);
  if (user.tasksUsed >= limit) {
    throw new UsageLimitError(
      `You've used all ${limit} tasks on the ${user.plan} plan this period. ` +
        (user.plan === "free"
          ? "Upgrade to Pro for 500 tasks/month, or paste your own API key in Settings to bypass this limit entirely."
          : "Your plan resets automatically next period.")
    );
  }

  const updated = await prisma.user.update({ where: { id: userId }, data: { tasksUsed: { increment: 1 } } });
  return { tasksUsed: updated.tasksUsed, limit, plan: updated.plan };
}

export async function getUsage(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { tasksUsed: 0, limit: FREE_TASK_LIMIT, plan: "free" };
  return { tasksUsed: user.tasksUsed, limit: limitFor(user.plan), plan: user.plan };
}
