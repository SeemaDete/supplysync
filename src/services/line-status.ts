import type { LineStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, effectiveDate, today } from "@/lib/dates";
import { num } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { audit } from "@/services/audit-service";

type Tx = Prisma.TransactionClient | typeof prisma;

export type QtySnapshot = {
  ordered: number;
  delivered: number;
  received: number;
  outstandingDelivery: number; // ordered - delivered
  outstandingReceipt: number; // ordered - received  (= "Outstanding Quantity")
  pendingGr: number; // delivered - received
};

export function quantities(ordered: number, delivered: number, received: number): QtySnapshot {
  return {
    ordered,
    delivered,
    received,
    outstandingDelivery: Math.max(ordered - delivered, 0),
    outstandingReceipt: Math.max(ordered - received, 0),
    pendingGr: Math.max(delivered - received, 0),
  };
}

/**
 * Status rules (first match wins):
 *  1. statusOverride set by an authorised user        → that status
 *  2. header CLOSED / CANCELLED                        → CLOSED
 *  3. discrepancy flag or delivered > ordered          → DISCREPANCY
 *  4. received ≥ ordered                               → FULLY_RECEIVED
 *  5. received > 0                                     → PARTIALLY_RECEIVED
 *  6. delivered ≥ ordered, GR not posted:
 *       last delivery older than grPendingAfterDays   → GR_PENDING, else DELIVERED
 *  7. effective date < today and nothing received      → OVERDUE
 *  8. delivered > 0                                    → PARTIALLY_DELIVERED (or GR_PENDING if aged)
 *  9. otherwise                                        → OPEN
 */
export function deriveStatus(input: {
  ordered: number;
  delivered: number;
  received: number;
  discrepancyFlag: boolean;
  statusOverride: LineStatus | null;
  headerStatus: string;
  effective: Date;
  lastDeliveryDate: Date | null;
  grPendingAfterDays: number;
  now: Date;
}): LineStatus {
  const { ordered, delivered, received } = input;
  if (input.statusOverride) return input.statusOverride;
  if (input.headerStatus === "CLOSED" || input.headerStatus === "CANCELLED") return "CLOSED";
  if (input.discrepancyFlag || delivered > ordered || received > delivered) return "DISCREPANCY";
  if (received >= ordered) return "FULLY_RECEIVED";
  if (received > 0) return "PARTIALLY_RECEIVED";
  const grAged = !!input.lastDeliveryDate && addDays(input.lastDeliveryDate, input.grPendingAfterDays) <= input.now;
  if (delivered >= ordered) return grAged ? "GR_PENDING" : "DELIVERED";
  if (input.effective < input.now) return "OVERDUE";
  if (delivered > 0) return grAged ? "GR_PENDING" : "PARTIALLY_DELIVERED";
  return "OPEN";
}

/**
 * Recalculate quantities and status of one line from its deliveries and GRs.
 * Call after any change to deliveries, GRs, dates or overrides.
 */
export async function recalcLine(tx: Tx, lineId: string, opts?: { userId?: string | null; grPendingAfterDays?: number }) {
  const line = await tx.purchaseOrderLine.findUniqueOrThrow({
    where: { id: lineId },
    include: {
      purchaseOrder: { select: { id: true, status: true, poNumber: true } },
      deliveries: { select: { quantity: true, deliveryDate: true }, orderBy: { deliveryDate: "desc" } },
      goodsReceipts: { where: { reversed: false }, select: { quantity: true, grNumber: true, grDate: true }, orderBy: { grDate: "desc" } },
    },
  });
  const grDays = opts?.grPendingAfterDays ?? (await getSettings()).grPendingAfterDays;

  const delivered = line.deliveries.reduce((s, d) => s + num(d.quantity), 0);
  const received = line.goodsReceipts.reduce((s, g) => s + num(g.quantity), 0);
  const q = quantities(num(line.orderedQty), delivered, received);
  const status = deriveStatus({
    ordered: q.ordered,
    delivered,
    received,
    discrepancyFlag: line.discrepancyFlag,
    statusOverride: line.statusOverride,
    headerStatus: line.purchaseOrder.status,
    effective: effectiveDate(line),
    lastDeliveryDate: line.deliveries[0]?.deliveryDate ?? null,
    grPendingAfterDays: grDays,
    now: today(),
  });

  const updated = await tx.purchaseOrderLine.update({
    where: { id: lineId },
    data: {
      deliveredQty: delivered,
      receivedQty: received,
      outstandingQty: q.outstandingReceipt,
      status,
      actualDeliveryDate: line.deliveries[0]?.deliveryDate ?? line.actualDeliveryDate,
      lastGrNumber: line.goodsReceipts[0]?.grNumber ?? null,
      lastGrDate: line.goodsReceipts[0]?.grDate ?? null,
    },
  });

  if (status !== line.status) {
    await audit(tx, {
      entityType: "PurchaseOrderLine",
      entityId: lineId,
      poNumber: line.purchaseOrder.poNumber,
      action: "STATUS_CHANGE",
      field: "status",
      before: line.status,
      after: status,
      userId: opts?.userId ?? null,
    });
  }
  await recalcHeader(tx, line.purchaseOrder.id, opts?.userId ?? null);
  return updated;
}

/** Header auto-closes when every line is fully received (or closed). */
export async function recalcHeader(tx: Tx, poId: string, userId: string | null) {
  const po = await tx.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: { lines: { select: { status: true } } },
  });
  if (po.status === "CANCELLED" || po.status === "DRAFT") return;
  const allDone = po.lines.length > 0 && po.lines.every((l) => l.status === "FULLY_RECEIVED" || l.status === "CLOSED");
  const next = allDone ? "CLOSED" : po.poSentDate ? (po.supplierReceiptStatus === "ACKNOWLEDGED" ? "OPEN" : "SENT") : "DRAFT";
  if (next !== po.status) {
    await tx.purchaseOrder.update({ where: { id: poId }, data: { status: next } });
    await audit(tx, { entityType: "PurchaseOrder", entityId: poId, poNumber: po.poNumber, action: "STATUS_CHANGE", field: "status", before: po.status, after: next, userId });
    if (next === "CLOSED") {
      // Close any open follow-ups – nothing left to chase
      const lineIds = (await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: poId }, select: { id: true } })).map((l) => l.id);
      await tx.followup.updateMany({ where: { lineId: { in: lineIds }, status: "OPEN" }, data: { status: "CANCELLED", outcome: "PO closed" } });
    }
  }
}
