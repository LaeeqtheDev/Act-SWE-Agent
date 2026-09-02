import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Every function here is only ever called from hosted-mode routes (see
// index.ts) — self-hosted mode has no concept of plans or payments at all.

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

// --- Stripe checkout ---

export async function createCheckoutSession(userId: string, email: string | undefined, successUrl: string, cancelUrl: string) {
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRO_PRICE_ID;
  if (!stripe || !priceId) {
    throw new Error("Stripe isn't configured yet — set STRIPE_SECRET_KEY and STRIPE_PRO_PRICE_ID.");
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer: user?.stripeCustomerId ?? undefined,
    customer_email: user?.stripeCustomerId ? undefined : email,
    client_reference_id: userId,
    metadata: { userId },
  });

  return { url: session.url };
}

// --- Stripe webhook ---
// Verifies the signature, then reacts to the two events that actually
// matter for this app: a subscription starting (upgrade to Pro) or ending
// (downgrade back to Free). Everything else is ignored.

export async function handleStripeWebhook(rawBody: Buffer, signature: string): Promise<{ received: boolean }> {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    throw new Error("Stripe webhook isn't configured (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET).");
  }

  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? (session.metadata?.userId as string | undefined);
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan: "pro",
            stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
            stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          },
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const user = await prisma.user.findFirst({ where: { stripeSubscriptionId: subscription.id } });
      if (user) {
        await prisma.user.update({ where: { id: user.id }, data: { plan: "free" } });
      }
      break;
    }
    default:
      break; // ignore everything else — this app only cares about plan changes
  }

  return { received: true };
}

// --- Bank transfer / manual receipt review ---
// A user uploads proof of payment; it sits as "pending" until a human
// approves or rejects it — never auto-approved (see the model comment in
// schema.prisma for why).

export async function submitReceipt(userId: string, receiptPath: string, fileName: string, amount?: string, note?: string) {
  return prisma.pendingPayment.create({
    data: { userId, receiptPath, fileName, amount, note },
  });
}

export async function listPendingPayments() {
  return prisma.pendingPayment.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" } });
}

export async function reviewPendingPayment(id: string, decision: "approved" | "rejected") {
  const payment = await prisma.pendingPayment.update({
    where: { id },
    data: { status: decision, reviewedAt: new Date() },
  });
  if (decision === "approved") {
    await prisma.user.update({ where: { id: payment.userId }, data: { plan: "pro" } });
  }
  return payment;
}

// Every submitted receipt regardless of status — the pending-only list above
// is for the "needs action" queue, this is for a full admin history view.
export async function listAllPayments() {
  return prisma.pendingPayment.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getPayment(id: string) {
  return prisma.pendingPayment.findUnique({ where: { id } });
}

// --- Bank details ---
// Your real bank account details for receiving transfers. Deliberately NOT
// hardcoded anywhere in source — they live only in your own untracked
// apps/api/.env, and are served from here so the frontend never needs its
// own copy. This matters a lot for an open-source repo: real account
// numbers must never end up committed to git history, which is permanent
// and public the moment this repo is pushed.
export function getBankDetails() {
  const bankName = process.env.BANK_NAME;
  const accountTitle = process.env.BANK_ACCOUNT_TITLE;
  const accountNumber = process.env.BANK_ACCOUNT_NUMBER;
  const iban = process.env.BANK_IBAN;

  // Show the section if ANY usable detail is configured — previously this
  // required BOTH bankName AND accountTitle and silently returned null
  // otherwise, so setting just the account number and IBAN (which is what
  // someone actually needs to send a transfer) showed nothing at all.
  if (!bankName && !accountTitle && !accountNumber && !iban) return null;

  return {
    configured: true,
    bankName: bankName || null,
    accountTitle: accountTitle || null,
    accountNumber: accountNumber || null,
    iban: iban || null,
    note: process.env.BANK_TRANSFER_NOTE || null,
  };
}

// --- Stripe customer portal ---
// Lets a Pro user manage or cancel their own subscription without you
// touching anything — Stripe hosts the whole UI.
export async function createPortalSession(userId: string, returnUrl: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe isn't configured yet — set STRIPE_SECRET_KEY.");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.stripeCustomerId) {
    throw new Error("No billing account found yet — subscribe first, then you can manage it here.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

// A direct "Downgrade to Free" button, not just a redirect to Stripe's
// portal — cancels the subscription right away (at period end, so a user
// who already paid for this month keeps Pro access until it runs out,
// standard SaaS behavior) without leaving the app. The portal above still
// exists for updating a card or viewing invoices; this is the one-click
// path for the single most common thing someone wants to do.
export async function cancelSubscription(userId: string): Promise<{ cancelsAt: Date | null }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe isn't configured yet — set STRIPE_SECRET_KEY.");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.stripeSubscriptionId) {
    throw new Error("No active subscription found to cancel.");
  }

  const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, { cancel_at_period_end: true });
  // Plan flips to "free" for real once Stripe's own webhook fires at period
  // end (customer.subscription.deleted, already handled) — this just
  // schedules that, it doesn't downgrade access early.
  return { cancelsAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null };
}

// --- Admin: manage any user's plan directly ---
// The blunt "just make this account Pro" tool, independent of Stripe or
// receipts — for comps, manual overrides, or fixing a mistake.

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
}

export async function setUserPlan(userId: string, plan: "free" | "pro") {
  return prisma.user.update({ where: { id: userId }, data: { plan } });
}
