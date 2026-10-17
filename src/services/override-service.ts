import type { LineStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/dates";
import { HttpError, type SessionUser } from "@/lib/session";
import { audit } from "@/services/audit-service";
import { recalcLine } from "@/services/line-status";
import { syncLineFollowup } from "@/services/followup-service";
import { assertLineAccess } from "@/services/po-service";

const LINE_STATUSES: LineStatus[] = [
  "OPEN", "PARTIALLY_DELIVERED", "DELIVERED", "GR_PENDING", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "OVERDUE", "DISCREPANCY", "CLOSED",
];

/**
 * Manual override for SAP/system corrections (Module 8).
 * Every change writes user, timestamp, before, after and reason to audit_logs (action OVERRIDE).
 * Setting status to "AUTO" removes a previous status override.
 */
export async function applyOverride(
  user: SessionUser,
  input: { lineId: string; field: "latestRevisedDate" | "commitmentDate" | "remarks" | "status" | "actualDeliveryDate"; value: string | null; reason: string },
) {
  const line = await assertLineAccess(user, input.lineId);
  let data: Record<string, unknown> = {};
  let before: unknown = null;
  let after: unknown = null;

  switch (input.field) {
    case "latestRevisedDate":
    case "commitmentDate":
    case "actualDeliveryDate": {
      const d = input.value ? toDateOnly(input.value) : null;
      if (input.value && !d) throw new HttpError(422, "Invalid date");
      before = line[input.field];
      after = d;
      data = { [input.field]: d };
      if (input.field === "latestRevisedDate" && d) data.confirmationStatus = "REVISED";
      break;
    }
    case "remarks":
      before = line.remarks;
      after = input.value;
      data = { remarks: input.value };
      break;
    case "status": {
      if (input.value === "AUTO" || !input.value) {
        before = line.statusOverride ?? line.status;
        after = "AUTO";
        data = { statusOverride: null, discrepancyFlag: false };
      } else {
        if (!LINE_STATUSES.includes(input.value as LineStatus)) throw new HttpError(422, "Unknown status");
        before = line.statusOverride ?? line.status;
        after = input.value;
        data = { statusOverride: input.value as LineStatus };
      }
      break;
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.purchaseOrderLine.update({ where: { id: input.lineId }, data });
    await audit(tx, {
      entityType: "PurchaseOrderLine", entityId: input.lineId, poNumber: line.purchaseOrder.poNumber,
      action: "OVERRIDE", field: input.field, before, after, reason: input.reason, userId: user.id,
    });
    await tx.communication.create({
      data: {
        purchaseOrderId: line.purchaseOrder.id, lineId: input.lineId, userId: user.id, channel: "SYSTEM", internal: true,
        message: `Manual override on line ${line.lineNumber}: ${input.field} changed. Reason: ${input.reason}`,
      },
    });
    const updated = await recalcLine(tx, input.lineId, { userId: user.id });
    await syncLineFollowup(tx, input.lineId, { userId: user.id });
    return updated;
  });
}
