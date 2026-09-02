import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Real email delivery via SMTP — works with Gmail, SendGrid, Resend, AWS
// SES, or any other SMTP-compatible provider, so self-hosters aren't locked
// into one vendor. Silently no-ops if SMTP isn't configured — this is the
// honest version of "email notifications": a genuine send when it's set
// up, never a fake "sent" status when it isn't.

let transporter: ReturnType<typeof nodemailer.createTransport> | null | undefined;
let warnedOnce = false;

function getTransporter() {
  if (transporter !== undefined) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    if (!warnedOnce) {
      console.log("[mailer] SMTP not configured — email notifications are disabled (in-app notifications still work).");
      warnedOnce = true;
    }
    transporter = null;
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  return transporter;
}

async function resolveEmail(userId?: string): Promise<string | null> {
  // Self-hosted (no userId): there's no per-account email, so a single
  // operator inbox (NOTIFY_EMAIL) is the only sensible destination.
  if (!userId) return process.env.NOTIFY_EMAIL ?? null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user?.email ?? null;
}

export async function sendEmailNotification(title: string, body: string, userId?: string): Promise<void> {
  const transport = getTransporter();
  if (!transport) return;

  const to = await resolveEmail(userId);
  if (!to) return; // nowhere to send it — not an error, just nothing to do

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transport.sendMail({ from, to, subject: title, text: body });
}
