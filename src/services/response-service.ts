import { prisma } from "@/lib/prisma";
import { today, toDateOnly, fmtDate } from "@/lib/dates";
import { HttpError, type SessionUser } from "@/lib/session";
import { audit } from "@/services/audit-service";
import { recalcLine } from "@/services/line-status";
import { syncLineFollowup } from "@/services/followup-service";
import { notify } from "@/services/notification-service";
import { assertLineAccess, assertPoAccess } from "@/services/po-service";

async function notifyBuyer(poId: string, title: string, body: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: { buyerId: true } });
  if (po) await notify(po.buyerId, { title, body, link: `/purchase-orders/${poId}` });
}

/** Supplier acknowledges receipt of the PO */
export async function acknowledgePo(user: SessionUser, poId: string, remarks: string | null) {
  const po = await assertPoAccess(user, poId);
  const full = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
  if (full.supplierReceiptStatus === "ACKNOWLEDGED") return full;
  if (!full.poSentDate) throw new HttpError(409, "PO has not been sent yet");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: { supplierReceiptStatus: "ACKNOWLEDGED", supplierReceiptDate: today(), status: full.status === "SENT" ? "OPEN" : full.status },
    });
    await audit(tx, { entityType: "PurchaseOrder", entityId: poId, poNumber: po.poNumber, action: "UPDATE", field: "supplierReceiptStatus", before: full.supplierReceiptStatus, after: "ACKNOWLEDGED", userId: user.id });
    await tx.communication.create({
      data: { purchaseOrderId: poId, userId: user.id, channel: "SYSTEM", message: `Supplier acknowledged receipt of PO${remarks ? ` – ${remarks}` : ""}` },
    });
    await notifyBuyer(poId, `PO ${po.poNumber} acknowledged`, `${user.name} confirmed receipt.`);
    return updated;
  });
}

/** Shared logic for a confirmed or revised supplier date (portal or buyer-recorded) */
async function applySupplierDate(
  user: SessionUser,
  lineId: string,
  kind: "CONFIRM" | "REVISE",
  date: Date,
  extra: { delayReason?: string | null; comments?: string | null; nextAction?: string | null; viaPortal: boolean },
) {
  const line = await assertLineAccess(user, lineId);
  if (line.purchaseOrder.archivedAt) throw new HttpError(409, "PO is archived");
  if (line.status === "CLOSED" || line.status === "FULLY_RECEIVED") throw new HttpError(409, "Line is already completed");

  return prisma.$transaction(async (tx) => {
    const previous = line.latestRevisedDate ?? line.supplierConfirmedDate;
    const isFirstConfirm = kind === "CONFIRM" && !line.supplierConfirmedDate;
    const data =
      kind === "CONFIRM" && isFirstConfirm
        ? { supplierConfirmedDate: date, confirmationStatus: "CONFIRMED" as const, commitmentDate: date }
        : { latestRevisedDate: date, confirmationStatus: (kind === "REVISE" ? "REVISED" : "CONFIRMED") as "REVISED" | "CONFIRMED", commitmentDate: date };
    if (extra.comments && extra.viaPortal) Object.assign(data, { supplierRemarks: extra.comments });

    await tx.purchaseOrderLine.update({ where: { id: lineId }, data });
    await tx.supplierResponse.create({
      data: {
        lineId,
        responseReceived: true,
        responseDate: today(),
        deliveryConfirmed: true,
        confirmedDate: kind === "CONFIRM" ? date : null,
        revisedDate: kind === "REVISE" || !isFirstConfirm ? date : null,
        previousDate: previous,
        delayReason: extra.delayReason ?? null,
        supplierComments: extra.comments ?? null,
        nextAction: extra.nextAction ?? null,
        recordedById: user.id,
        viaPortal: extra.viaPortal,
      },
    });
    const field = "supplierConfirmedDate" in data ? "supplierConfirmedDate" : "latestRevisedDate";
    await audit(tx, {
      entityType: "PurchaseOrderLine", entityId: lineId, poNumber: line.purchaseOrder.poNumber, action: "UPDATE",
      field, before: previous, after: date, reason: extra.delayReason ?? (kind === "CONFIRM" ? "Supplier confirmation" : null), userId: user.id,
    });
    await tx.communication.create({
      data: {
        purchaseOrderId: line.purchaseOrder.id, lineId, userId: user.id, channel: "SYSTEM",
        message:
          kind === "CONFIRM" && isFirstConfirm
            ? `Line ${line.lineNumber}: delivery date confirmed for ${fmtDate(date)}`
            : `Line ${line.lineNumber}: delivery date revised ${fmtDate(previous)} → ${fmtDate(date)}${extra.delayReason ? ` (reason: ${extra.delayReason})` : ""}`,
      },
    });
    await recalcLine(tx, lineId, { userId: user.id });
    await syncLineFollowup(tx, lineId, { userId: user.id }); // recalculates follow-up; old one kept as SUPERSEDED
    if (extra.viaPortal) {
      await notifyBuyer(line.purchaseOrder.id, `PO ${line.purchaseOrder.poNumber}/${line.lineNumber}: date ${kind === "CONFIRM" ? "confirmed" : "revised"}`, `New date ${fmtDate(date)}${extra.delayReason ? ` – ${extra.delayReason}` : ""}`);
    }
    return { ok: true };
  });
}

export function supplierConfirm(user: SessionUser, lineId: string, date: string, remarks: string | null) {
  return applySupplierDate(user, lineId, "CONFIRM", toDateOnly(date)!, { comments: remarks, viaPortal: user.role === "SUPPLIER" });
}

export function supplierRevise(user: SessionUser, lineId: string, date: string, delayReason: string, remarks: string | null) {
  return applySupplierDate(user, lineId, "REVISE", toDateOnly(date)!, { delayReason, comments: remarks, viaPortal: user.role === "SUPPLIER" });
}

export async function updateDispatch(user: SessionUser, lineId: string, qty: number, remarks: string | null) {
  const line = await assertLineAccess(user, lineId);
  const ordered = Number(line.orderedQty);
  if (qty > ordered) throw new HttpError(422, `Dispatch quantity cannot exceed ordered quantity (${ordered})`);
  return prisma.$transaction(async (tx) => {
    await tx.purchaseOrderLine.update({ where: { id: lineId }, data: { dispatchedQty: qty, ...(remarks ? { supplierRemarks: remarks } : {}) } });
    await audit(tx, { entityType: "PurchaseOrderLine", entityId: lineId, poNumber: line.purchaseOrder.poNumber, action: "UPDATE", field: "dispatchedQty", before: line.dispatchedQty, after: qty, userId: user.id });
    await tx.communication.create({ data: { purchaseOrderId: line.purchaseOrder.id, lineId, userId: user.id, channel: "SYSTEM", message: `Line ${line.lineNumber}: dispatched quantity updated to ${qty} ${line.uom}` } });
    await notifyBuyer(line.purchaseOrder.id, `Dispatch update PO ${line.purchaseOrder.poNumber}`, `Line ${line.lineNumber}: ${qty} ${line.uom} dispatched`);
    return { ok: true };
  });
}

/** Buyer records a response received by phone/email (Module 6) */
export async function recordResponse(
  user: SessionUser,
  input: {
    lineId: string; responseReceived: boolean; responseDate: string; deliveryConfirmed: boolean;
    confirmedDate: string | null; revisedDate: string | null; delayReason: string | null; supplierComments: string | null;
    nextAction: string | null; nextFollowupDate: string | null;
  },
) {
  const line = await assertLineAccess(user, input.lineId);
  // A date change goes through the same path as the portal so follow-ups are recalculated
  if (input.revisedDate) {
    await applySupplierDate(user, input.lineId, "REVISE", toDateOnly(input.revisedDate)!, { delayReason: input.delayReason, comments: input.supplierComments, nextAction: input.nextAction, viaPortal: false });
  } else if (input.confirmedDate) {
    await applySupplierDate(user, input.lineId, "CONFIRM", toDateOnly(input.confirmedDate)!, { comments: input.supplierComments, nextAction: input.nextAction, viaPortal: false });
  } else {
    await prisma.$transaction(async (tx) => {
      const r = await tx.supplierResponse.create({
        data: {
          lineId: input.lineId, responseReceived: input.responseReceived, responseDate: toDateOnly(input.responseDate)!,
          deliveryConfirmed: input.deliveryConfirmed, delayReason: input.delayReason, supplierComments: input.supplierComments,
          nextAction: input.nextAction, recordedById: user.id,
        },
      });
      await audit(tx, { entityType: "SupplierResponse", entityId: r.id, poNumber: line.purchaseOrder.poNumber, action: "CREATE", after: input.responseReceived ? "Response received" : "No response", userId: user.id });
    });
  }
  // Close the open follow-up(s) for this line and optionally schedule the next one
  const open = await prisma.followup.findMany({ where: { lineId: input.lineId, status: "OPEN", dueDate: { lte: today() } } });
  for (const f of open) {
    await prisma.followup.update({ where: { id: f.id }, data: { status: "DONE", completedAt: new Date(), completedById: user.id, outcome: input.responseReceived ? "Supplier responded" : "No response" } });
  }
  const next = toDateOnly(input.nextFollowupDate);
  await prisma.purchaseOrderLine.update({ where: { id: input.lineId }, data: { lastFollowupDate: today(), ...(next ? { nextFollowupDate: next } : {}) } });
  if (next) {
    const fresh = await prisma.purchaseOrderLine.findUniqueOrThrow({ where: { id: input.lineId } });
    await prisma.followup.create({
      data: { lineId: input.lineId, targetDate: fresh.latestRevisedDate ?? fresh.supplierConfirmedDate ?? fresh.originalRequestedDate, dueDate: next, source: "MANUAL", assignedToId: line.purchaseOrder.buyerId },
    });
  }
  return { ok: true };
}
