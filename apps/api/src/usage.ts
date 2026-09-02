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
  if (existing) {
    // Backfill email once if we didn't have it yet — needed so email
    // notifications (mailer.ts) have somewhere to send. Only ever a single
    // Clerk lookup per user, cached in the DB after that, not a per-request cost.
    if (!existing.email && process.env.HOSTED_MODE === "true") {
      const fetched = await fetchClerkEmail(userId);
      if (fetched) return prisma.user.update({ where: { id: userId }, data: { email: fetched } });
    }
    return existing;
  }
  const email0 = email ?? (process.env.HOSTED_MODE === "true" ? await fetchClerkEmail(userId) : undefined);
  return prisma.user.create({ data: { id: userId, email: email0 } });
}

async function fetchClerkEmail(userId: string): Promise<string | undefined> {
  try {
    const { clerkClient } = await import("@clerk/express");
    const user = await clerkClient.users.getUser(userId);
    return user.emailAddresses[0]?.emailAddress;
  } catch (err) {
    console.error("[usage] failed to fetch email from Clerk:", err);
    return undefined;
  }
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
