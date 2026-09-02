import { PrismaClient } from "@prisma/client";
import { sendEmailNotification } from "./mailer.js";

const prisma = new PrismaClient();

// In-app notifications — a workflow finishing, an agent-detected incident
// firing, anything worth surfacing while nobody's actively watching the
// chat. This is the reliable baseline; email delivery is layered on top
// (see mailer.ts) — it's a genuine send when SMTP is configured, and a
// silent no-op when it isn't, never a fake "sent" status either way.

export async function createNotification(title: string, body: string, opts: { userId?: string; link?: string } = {}) {
  const notification = await prisma.notification.create({
    data: { title, body: body.slice(0, 500), userId: opts.userId, link: opts.link },
  });
  sendEmailNotification(title, body, opts.userId).catch((err) => console.error("[notifications] email send failed:", err));
  return notification;
}

export async function listNotifications(userId?: string) {
  return prisma.notification.findMany({
    where: userId ? { userId } : { userId: null },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
}

export async function unreadCount(userId?: string): Promise<number> {
  return prisma.notification.count({ where: { ...(userId ? { userId } : { userId: null }), read: false } });
}

export async function markRead(id: string) {
  return prisma.notification.update({ where: { id }, data: { read: true } });
}

export async function markAllRead(userId?: string) {
  await prisma.notification.updateMany({ where: userId ? { userId } : { userId: null }, data: { read: true } });
}
