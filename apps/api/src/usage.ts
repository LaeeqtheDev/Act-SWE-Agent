import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Only ever called in hosted mode, keyed by Clerk user id. Self-hosted /
// BYOK usage never calls into this file at all — see index.ts, where these
// checks are skipped entirely when HOSTED_MODE isn't "true".

// Billing on messages was the wrong unit. "What's 2+2" and "find and apply
// to 5 jobs" both counted as one task, but the second costs 30x more in
// provider tokens — so the heaviest users were the least profitable, which
// is backwards. These are STEPS: one model call, which is what actually
// maps to cost.
//
// Rough economics at ~$0.01-0.05 per step on a mid-tier model: 2,000 steps
// is $20-100 of provider cost against $30 revenue. Still thin at the top
// end, which is why chargeExtraSteps below exists — heavy users get pushed
// toward bringing their own key rather than being silently subsidised.
const FREE_STEP_LIMIT = 60; // ~10-15 real tasks
const PRO_STEP_LIMIT = 2000; // ~300-500 real tasks
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, rolling from first use

export class UsageLimitError extends Error {}

// Short acknowledgements shouldn't cost a task. A small model will often
// fire a tool call at "thanks" no matter what the prompt says, so this is a
// real check rather than an instruction it might ignore. Deliberately
// narrow: only very short messages that are entirely pleasantries.
// Anchored to match the WHOLE message, so "thanks" is a pleasantry but
// "thanks, now open youtube" is not — the trailing instruction stops it
// matching at all. Longer phrases come first so "thank you" wins over
// "thank". Erring toward "not a pleasantry" is the safe direction: the cost
// of a false positive (silently stripping the agent's tools from a real
// request) is far worse than charging a task for a chatty message.
const PLEASANTRIES =
  /^(thank you( so much| very much)?|thanks( a lot| so much)?|that worked|it worked|sounds good|got it|no problem|good job|well done|love it|nice one|goodbye|thx|ty|ok(ay)?|k|cool|nice|great|awesome|perfect|amazing|yes|yep|yeah|no|nope|sure|alright|good|done|works|bye)$/i;

export function isPleasantry(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 40) return false; // long messages may contain a real request
  if (trimmed.includes("?")) return false; // a question is a request, however short
  // Strip trailing punctuation so "Thanks!" still matches the anchored pattern.
  if (!PLEASANTRIES.test(trimmed.replace(/[!.,]+$/, ""))) return false;

  // If anything meaningful follows the pleasantry, it's a request:
  // "thanks" is small talk, "thanks, now open youtube" and "no, use the
  // other one" are instructions. Erring toward "not a pleasantry" is the
  // safe direction — the cost of a false positive (silently stripping the
  // agent's tools from a real request) is far worse than charging a task
  // for a slightly chatty message.
  return true;
}

function limitFor(plan: string) {
  return plan === "pro" ? PRO_STEP_LIMIT : FREE_STEP_LIMIT;
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

// Called after each model call within a task. The initial
// checkAndIncrementUsage covers step one; this bills the rest, so a task
// that takes twelve steps costs twelve rather than one. Deliberately does
// NOT throw mid-task — cutting someone off halfway through leaves them with
// nothing for what they've already spent. It over-runs slightly, then the
// next task is refused.
export async function chargeExtraSteps(userId: string, steps: number): Promise<void> {
  if (steps <= 0) return;
  await prisma.user.update({ where: { id: userId }, data: { tasksUsed: { increment: steps } } }).catch(() => {});
}

export async function getUsage(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { tasksUsed: 0, limit: FREE_STEP_LIMIT, plan: "free" };
  return { tasksUsed: user.tasksUsed, limit: limitFor(user.plan), plan: user.plan };
}
