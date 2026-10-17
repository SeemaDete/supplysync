import { prisma } from "@/lib/prisma";

export async function notify(userId: string, n: { title: string; body: string; link?: string }) {
  return prisma.notification.create({ data: { userId, title: n.title, body: n.body, link: n.link ?? null } });
}

/** Notify every active user linked to a supplier (supplier portal users) */
export async function notifySupplierUsers(supplierId: string, n: { title: string; body: string; link?: string }) {
  const users = await prisma.user.findMany({ where: { supplierId, active: true }, select: { id: true } });
  if (!users.length) return;
  await prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, title: n.title, body: n.body, link: n.link ?? null })) });
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}
