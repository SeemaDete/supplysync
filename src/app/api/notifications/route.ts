import { withApi, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export const GET = withApi(async () => {
  const user = await requireApiUser();
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);
  return { items, unread };
});

// PATCH { ids?: string[] } – mark given (or all) as read
export const PATCH = withApi(async (req) => {
  const user = await requireApiUser();
  const { ids } = await readJson<{ ids?: string[] }>(req);
  await prisma.notification.updateMany({ where: { userId: user.id, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { read: true } });
  return { ok: true };
});
