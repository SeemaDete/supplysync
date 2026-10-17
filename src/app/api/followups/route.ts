import type { Prisma } from "@prisma/client";
import { withApi } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { addDays, today } from "@/lib/dates";

// GET /api/followups?bucket=overdue|today|tomorrow|week|all&mine=1
export const GET = withApi(async (req) => {
  const user = await requireApiUser("followup:manage");
  const sp = new URL(req.url).searchParams;
  const t = today();
  const bucket = sp.get("bucket") ?? "all";
  const where: Prisma.FollowupWhereInput = { status: "OPEN", line: { purchaseOrder: { archivedAt: null } } };
  if (sp.get("mine") === "1") where.assignedToId = user.id;
  if (bucket === "overdue") where.dueDate = { lt: t };
  if (bucket === "today") where.dueDate = t;
  if (bucket === "tomorrow") where.dueDate = addDays(t, 1);
  if (bucket === "week") where.dueDate = { gte: t, lte: addDays(t, 7) };
  return prisma.followup.findMany({
    where,
    orderBy: { dueDate: "asc" },
    take: 500,
    include: {
      assignedTo: { select: { name: true } },
      line: { include: { purchaseOrder: { select: { id: true, poNumber: true, supplier: { select: { name: true, email: true } } } } } },
    },
  });
});
