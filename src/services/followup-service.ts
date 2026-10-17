import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, isoDate, today, fmtDate } from "@/lib/dates";
import { getSettings } from "@/lib/settings";
import { audit } from "@/services/audit-service";
import { notify } from "@/services/notification-service";
import { sendMail } from "@/services/email-service";

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * FOLLOW-UP ENGINE
 *
 * A follow-up task is due (supplier date − leadDays) where supplier date =
 * latest revised date, else supplier confirmed date.
 *
 * Eligibility: PO not archived / closed / cancelled, line outstanding qty > 0,
 * a supplier date exists, and no AUTO follow-up exists yet for that exact supplier date.
 *
 * "Generate only once" is enforced by the unique generationKey "<lineId>:<yyyy-mm-dd>",
 * so concurrent cron runs or retries can never create duplicates.
 *
 * When the supplier date changes, open AUTO follow-ups for the old date are marked
 * SUPERSEDED (kept for history) and a new one is generated for the new date.
 */
export function generationKey(lineId: string, target: Date) {
  return `${lineId}:${isoDate(target)}`;
}

export function computeDueDate(target: Date, leadDays: number, now = today()) {
  const due = addDays(target, -leadDays);
  return due < now ? now : due; // never create a task in the past
}

/** Ensure the right AUTO follow-up exists for one line. Returns the created follow-up, if any. */
export async function syncLineFollowup(tx: Tx, lineId: string, opts?: { leadDays?: number; userId?: string | null }) {
  const leadDays = opts?.leadDays ?? (await getSettings()).followupLeadDays;
  const line = await tx.purchaseOrderLine.findUniqueOrThrow({
    where: { id: lineId },
    include: { purchaseOrder: { select: { poNumber: true, status: true, archivedAt: true, buyerId: true } } },
  });
  const target = line.latestRevisedDate ?? line.supplierConfirmedDate;
  const po = line.purchaseOrder;
  const eligible =
    !!target &&
    !po.archivedAt &&
    (po.status === "SENT" || po.status === "OPEN") &&
    Number(line.outstandingQty) > 0 &&
    line.status !== "CLOSED" &&
    line.status !== "FULLY_RECEIVED";

  const key = target ? generationKey(lineId, target) : null;

  // Supersede open AUTO follow-ups whose target date no longer matches
  const stale = await tx.followup.findMany({
    where: { lineId, status: "OPEN", source: "AUTO", ...(key ? { NOT: { generationKey: key } } : {}) },
  });

  let created = null;
  if (eligible && key) {
    const existing = await tx.followup.findUnique({ where: { generationKey: key } });
    if (existing && existing.status === "SUPERSEDED") {
      // Supplier went back to a date we already had: reactivate that follow-up instead of duplicating it
      const due = computeDueDate(target!, leadDays);
      created = await tx.followup.update({
        where: { id: existing.id },
        data: { status: "OPEN", dueDate: due, notifiedAt: null, supersededById: null, outcome: null },
      });
      await tx.purchaseOrderLine.update({ where: { id: lineId }, data: { followupDate: due, nextFollowupDate: due } });
    } else if (!existing) {
      const due = computeDueDate(target!, leadDays);
      created = await tx.followup.create({
        data: { lineId, targetDate: target!, dueDate: due, source: "AUTO", assignedToId: po.buyerId, generationKey: key },
      });
      await tx.purchaseOrderLine.update({ where: { id: lineId }, data: { followupDate: due, nextFollowupDate: due } });
      await audit(tx, {
        entityType: "Followup", entityId: created.id, poNumber: po.poNumber, action: "CREATE",
        field: "dueDate", after: due, reason: `Auto: supplier date ${fmtDate(target)} − ${leadDays} days`, userId: opts?.userId ?? null,
      });
    }
  }

  for (const f of stale) {
    await tx.followup.update({
      where: { id: f.id },
      data: { status: "SUPERSEDED", supersededById: created?.id ?? null, outcome: "Supplier date changed – recalculated" },
    });
    await audit(tx, {
      entityType: "Followup", entityId: f.id, poNumber: po.poNumber, action: "STATUS_CHANGE",
      field: "status", before: "OPEN", after: "SUPERSEDED", reason: "Revised delivery date entered", userId: opts?.userId ?? null,
    });
  }
  return created;
}

/** Complete a follow-up; optionally schedule the next manual one. */
export async function completeFollowup(followupId: string, userId: string, outcome: string | null, nextDate: Date | null) {
  return prisma.$transaction(async (tx) => {
    const f = await tx.followup.findUniqueOrThrow({
      where: { id: followupId },
      include: { line: { include: { purchaseOrder: { select: { poNumber: true, buyerId: true } } } } },
    });
    const done = await tx.followup.update({
      where: { id: followupId },
      data: { status: "DONE", completedAt: new Date(), completedById: userId, outcome },
    });
    await tx.purchaseOrderLine.update({ where: { id: f.lineId }, data: { lastFollowupDate: today(), nextFollowupDate: nextDate } });
    if (nextDate) {
      await tx.followup.create({
        data: { lineId: f.lineId, targetDate: f.targetDate, dueDate: nextDate, source: "MANUAL", assignedToId: f.line.purchaseOrder.buyerId },
      });
    }
    await audit(tx, {
      entityType: "Followup", entityId: followupId, poNumber: f.line.purchaseOrder.poNumber, action: "STATUS_CHANGE",
      field: "status", before: f.status, after: "DONE", reason: outcome, userId,
    });
    return done;
  });
}

export type SchedulerResult = { scanned: number; created: number; superseded: number; notified: number; statusRecalculated: number; errors: string[] };

/**
 * Daily job (Vercel Cron → /api/cron/followups):
 *  1. Recalculate status of every open line (OVERDUE / GR_PENDING are time-based)
 *  2. Create / recalculate follow-ups
 *  3. Notify buyers (in-app + optional email) for follow-ups due today or overdue, once per follow-up
 */
export async function runFollowupScheduler(): Promise<SchedulerResult> {
  const { recalcLine } = await import("@/services/line-status");
  const settings = await getSettings();
  const result: SchedulerResult = { scanned: 0, created: 0, superseded: 0, notified: 0, statusRecalculated: 0, errors: [] };

  const lines = await prisma.purchaseOrderLine.findMany({
    where: {
      purchaseOrder: { archivedAt: null, status: { in: ["SENT", "OPEN"] } },
      status: { notIn: ["CLOSED", "FULLY_RECEIVED"] },
    },
    select: { id: true, status: true },
  });

  for (const l of lines) {
    result.scanned++;
    try {
      await prisma.$transaction(async (tx) => {
        const before = l.status;
        const after = await recalcLine(tx, l.id, { grPendingAfterDays: settings.grPendingAfterDays });
        if (after.status !== before) result.statusRecalculated++;
        const supersededBefore = await tx.followup.count({ where: { lineId: l.id, status: "SUPERSEDED" } });
        const created = await syncLineFollowup(tx, l.id, { leadDays: settings.followupLeadDays });
        if (created) result.created++;
        result.superseded += (await tx.followup.count({ where: { lineId: l.id, status: "SUPERSEDED" } })) - supersededBefore;
      });
    } catch (e) {
      result.errors.push(`${l.id}: ${(e as Error).message}`);
    }
  }

  // Notify for due/overdue follow-ups that have not been notified yet
  const due = await prisma.followup.findMany({
    where: { status: "OPEN", notifiedAt: null, dueDate: { lte: today() } },
    include: {
      assignedTo: { select: { id: true, email: true, name: true } },
      line: { include: { purchaseOrder: { include: { supplier: { select: { name: true } } } } } },
    },
  });
  for (const f of due) {
    const po = f.line.purchaseOrder;
    if (f.assignedTo) {
      await notify(f.assignedTo.id, {
        title: `Follow-up due: PO ${po.poNumber}/${f.line.lineNumber}`,
        body: `${po.supplier.name} – ${f.line.materialDescription}. Supplier date ${fmtDate(f.targetDate)}.`,
        link: `/purchase-orders/${po.id}?tab=followups`,
      });
      if (settings.emailBuyerOnFollowup) {
        // Reminder to the buyer (internal). Failure is logged, never blocks the job.
        await sendMail({
          to: f.assignedTo.email,
          subject: `[SupplySync] Follow-up due – PO ${po.poNumber}`,
          text: `Hi ${f.assignedTo.name},\n\nA supplier follow-up is due today for PO ${po.poNumber} line ${f.line.lineNumber} (${f.line.materialDescription}), supplier ${po.supplier.name}, delivery date ${fmtDate(f.targetDate)}.\n\nOpen: ${process.env.APP_URL ?? ""}/purchase-orders/${po.id}?tab=followups\n\n— SupplySync`,
        }).catch(() => undefined);
      }
    }
    await prisma.followup.update({ where: { id: f.id }, data: { notifiedAt: new Date() } });
    result.notified++;
  }
  return result;
}

/** Bucket counts for dashboard widgets */
export async function followupBuckets(where: Prisma.FollowupWhereInput = {}) {
  const t = today();
  const tomorrow = addDays(t, 1);
  const weekEnd = addDays(t, 7);
  const base: Prisma.FollowupWhereInput = { ...where, status: "OPEN" };
  const [overdue, dueToday, dueTomorrow, dueThisWeek] = await Promise.all([
    prisma.followup.count({ where: { ...base, dueDate: { lt: t } } }),
    prisma.followup.count({ where: { ...base, dueDate: t } }),
    prisma.followup.count({ where: { ...base, dueDate: tomorrow } }),
    prisma.followup.count({ where: { ...base, dueDate: { gte: t, lte: weekEnd } } }),
  ]);
  return { overdue, dueToday, dueTomorrow, dueThisWeek };
}
