import { prisma } from "@/lib/prisma";
import { toDateOnly, fmtDate, today } from "@/lib/dates";
import { HttpError, type SessionUser } from "@/lib/session";
import { num } from "@/lib/utils";
import { audit } from "@/services/audit-service";
import { recalcLine } from "@/services/line-status";
import { syncLineFollowup } from "@/services/followup-service";
import { assertLineAccess } from "@/services/po-service";
import { notify } from "@/services/notification-service";

/**
 * Record a (partial) delivery. Multiple deliveries per line are allowed.
 * Over-delivery beyond the ordered quantity is rejected unless `allowOverDelivery`
 * is set, in which case the line is flagged DISCREPANCY for the buyer to resolve.
 */
export async function recordDelivery(
  user: SessionUser,
  input: { lineId: string; deliveryNote: string; asnNumber: string | null; deliveryDate: string; quantity: number; remarks: string | null },
  allowOverDelivery = false,
) {
  const line = await assertLineAccess(user, input.lineId);
  if (line.purchaseOrder.archivedAt) throw new HttpError(409, "PO is archived");
  if (line.status === "CLOSED") throw new HttpError(409, "Line is closed");
  const date = toDateOnly(input.deliveryDate)!;
  if (date > today()) throw new HttpError(422, "Delivery date cannot be in the future");

  const deliveredSoFar = num(line.deliveredQty);
  const ordered = num(line.orderedQty);
  const after = deliveredSoFar + input.quantity;
  if (after > ordered && !allowOverDelivery) {
    throw new HttpError(422, `Delivered quantity (${after}) would exceed ordered quantity (${ordered}). Remaining to deliver: ${Math.max(ordered - deliveredSoFar, 0)}.`);
  }

  return prisma.$transaction(async (tx) => {
    const d = await tx.deliveryRecord.create({
      data: {
        lineId: input.lineId, deliveryNote: input.deliveryNote, asnNumber: input.asnNumber, deliveryDate: date,
        quantity: input.quantity, remarks: input.remarks, createdById: user.id,
      },
    });
    if (after > ordered) await tx.purchaseOrderLine.update({ where: { id: input.lineId }, data: { discrepancyFlag: true } });
    await audit(tx, {
      entityType: "DeliveryRecord", entityId: d.id, poNumber: line.purchaseOrder.poNumber, action: "CREATE",
      field: "quantity", after: `${input.quantity} ${line.uom} (DN ${input.deliveryNote})`, userId: user.id,
    });
    await tx.communication.create({
      data: {
        purchaseOrderId: line.purchaseOrder.id, lineId: input.lineId, userId: user.id, channel: "SYSTEM",
        message: `Line ${line.lineNumber}: ${input.quantity} ${line.uom} delivered on ${fmtDate(date)} (DN ${input.deliveryNote})`,
      },
    });
    const updated = await recalcLine(tx, input.lineId, { userId: user.id });
    await syncLineFollowup(tx, input.lineId, { userId: user.id });
    await notify(line.purchaseOrder.buyerId, {
      title: `Delivery received – PO ${line.purchaseOrder.poNumber}`,
      body: `Line ${line.lineNumber}: ${input.quantity} ${line.uom}. GR pending.`,
      link: `/purchase-orders/${line.purchaseOrder.id}?tab=deliveries`,
    });
    return { delivery: d, line: updated };
  });
}

/**
 * Post a goods receipt. Rules:
 *  - GR quantity cannot exceed delivered-but-not-yet-received quantity
 *  - Total received cannot exceed ordered quantity
 *  - When linked to a delivery, GR cannot exceed that delivery's open quantity
 */
export async function postGoodsReceipt(
  user: SessionUser,
  input: { lineId: string; deliveryRecordId?: string | null; grNumber: string; grDate: string; quantity: number; remarks: string | null },
) {
  const line = await assertLineAccess(user, input.lineId);
  if (line.purchaseOrder.archivedAt) throw new HttpError(409, "PO is archived");
  const ordered = num(line.orderedQty);
  const delivered = num(line.deliveredQty);
  const received = num(line.receivedQty);
  const date = toDateOnly(input.grDate)!;

  if (received + input.quantity > delivered) {
    throw new HttpError(422, `GR quantity cannot exceed delivered quantity. Delivered ${delivered}, already received ${received}, max GR now ${Math.max(delivered - received, 0)}.`);
  }
  if (received + input.quantity > ordered) {
    throw new HttpError(422, `Received quantity cannot exceed ordered quantity (${ordered}).`);
  }
  if (input.deliveryRecordId) {
    const d = await prisma.deliveryRecord.findFirst({
      where: { id: input.deliveryRecordId, lineId: input.lineId },
      include: { goodsReceipts: { where: { reversed: false }, select: { quantity: true } } },
    });
    if (!d) throw new HttpError(404, "Delivery not found for this line");
    const open = num(d.quantity) - d.goodsReceipts.reduce((s, g) => s + num(g.quantity), 0);
    if (input.quantity > open) throw new HttpError(422, `GR exceeds open quantity of delivery ${d.deliveryNote} (${open}).`);
    if (date < d.deliveryDate) throw new HttpError(422, "GR date cannot be before the delivery date");
  }

  return prisma.$transaction(async (tx) => {
    const gr = await tx.goodsReceipt.create({
      data: {
        lineId: input.lineId, deliveryRecordId: input.deliveryRecordId || null, grNumber: input.grNumber, grDate: date,
        quantity: input.quantity, remarks: input.remarks, createdById: user.id,
      },
    });
    await audit(tx, { entityType: "GoodsReceipt", entityId: gr.id, poNumber: line.purchaseOrder.poNumber, action: "CREATE", field: "quantity", after: `${input.quantity} ${line.uom} (GR ${input.grNumber})`, userId: user.id });
    await tx.communication.create({
      data: {
        purchaseOrderId: line.purchaseOrder.id, lineId: input.lineId, userId: user.id, channel: "SYSTEM",
        message: `Line ${line.lineNumber}: GR ${input.grNumber} posted for ${input.quantity} ${line.uom}`,
      },
    });
    const updated = await recalcLine(tx, input.lineId, { userId: user.id });
    await syncLineFollowup(tx, input.lineId, { userId: user.id });
    return { gr, line: updated };
  });
}

/** GRs are never deleted – a mistaken GR is reversed (like SAP movement type 102) */
export async function reverseGoodsReceipt(user: SessionUser, grId: string, reason: string) {
  const gr = await prisma.goodsReceipt.findUniqueOrThrow({ where: { id: grId } });
  const line = await assertLineAccess(user, gr.lineId);
  if (gr.reversed) throw new HttpError(409, "GR already reversed");
  return prisma.$transaction(async (tx) => {
    await tx.goodsReceipt.update({ where: { id: grId }, data: { reversed: true } });
    await audit(tx, { entityType: "GoodsReceipt", entityId: grId, poNumber: line.purchaseOrder.poNumber, action: "OVERRIDE", field: "reversed", before: false, after: true, reason, userId: user.id });
    await recalcLine(tx, gr.lineId, { userId: user.id });
    return { ok: true };
  });
}
