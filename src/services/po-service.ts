import type { LineStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { today, toDateOnly, addDays } from "@/lib/dates";
import { HttpError, type SessionUser } from "@/lib/session";
import type { PoCreateInput, PoLineInput } from "@/lib/validation";
import { audit, auditDiff } from "@/services/audit-service";
import { recalcLine } from "@/services/line-status";
import { syncLineFollowup } from "@/services/followup-service";
import { notifySupplierUsers } from "@/services/notification-service";

// ─────────────────────────── Access scoping ───────────────────────────

/** Row-level security: suppliers only ever see their own, already-sent, non-archived POs */
export function poScope(user: SessionUser): Prisma.PurchaseOrderWhereInput {
  if (user.role === "SUPPLIER") {
    return { supplierId: user.supplierId ?? "__none__", poSentDate: { not: null }, archivedAt: null };
  }
  return {};
}

export async function assertPoAccess(user: SessionUser, poId: string) {
  const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, ...poScope(user) }, select: { id: true, poNumber: true, supplierId: true, buyerId: true, archivedAt: true } });
  if (!po) throw new HttpError(404, "Purchase order not found");
  return po;
}

export async function assertLineAccess(user: SessionUser, lineId: string) {
  const line = await prisma.purchaseOrderLine.findFirst({
    where: { id: lineId, purchaseOrder: poScope(user) },
    include: { purchaseOrder: { select: { id: true, poNumber: true, supplierId: true, buyerId: true, archivedAt: true, status: true } } },
  });
  if (!line) throw new HttpError(404, "PO line not found");
  return line;
}

// ─────────────────────────── List / search / filter ───────────────────────────

export type PoListFilters = {
  q?: string;
  status?: string; // line status
  supplierId?: string;
  buyerId?: string;
  plant?: string;
  archived?: "only" | "include" | "exclude";
  overdue?: boolean;
  from?: string;
  to?: string;
};

/** Filters are applied at line level - the tracker shows one row per PO line (like ME2M in SAP) */
export function lineWhere(user: SessionUser, f: PoListFilters): Prisma.PurchaseOrderLineWhereInput {
  const and: Prisma.PurchaseOrderLineWhereInput[] = [];
  const poWhere: Prisma.PurchaseOrderWhereInput = { ...poScope(user) };
  if (f.archived === "only") poWhere.archivedAt = { not: null };
  else if (f.archived !== "include" && user.role !== "SUPPLIER") poWhere.archivedAt = null;
  if (f.supplierId) poWhere.supplierId = f.supplierId;
  if (f.buyerId) poWhere.buyerId = f.buyerId;
  const from = toDateOnly(f.from);
  const to = toDateOnly(f.to);
  if (from || to) poWhere.poCreationDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  and.push({ purchaseOrder: poWhere });

  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({
      OR: [
        { purchaseOrder: { poNumber: { contains: q, mode: "insensitive" } } },
        { materialNumber: { contains: q, mode: "insensitive" } },
        { materialDescription: { contains: q, mode: "insensitive" } },
        { purchaseOrder: { supplier: { name: { contains: q, mode: "insensitive" } } } },
        { purchaseOrder: { supplier: { code: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (f.status) and.push({ status: f.status as LineStatus });
  if (f.plant) and.push({ plant: f.plant });
  if (f.overdue) and.push({ status: { notIn: ["FULLY_RECEIVED", "CLOSED"] }, outstandingQty: { gt: 0 }, OR: [{ status: "OVERDUE" }, { latestRevisedDate: { lt: today() } }, { latestRevisedDate: null, supplierConfirmedDate: { lt: today() } }] });
  return { AND: and };
}

export const lineListInclude = {
  purchaseOrder: {
    select: {
      id: true, poNumber: true, poCreationDate: true, poSentDate: true, supplierReceiptStatus: true, supplierReceiptDate: true,
      status: true, archivedAt: true, currency: true,
      supplier: { select: { id: true, code: true, name: true, email: true, contactPerson: true } },
      buyer: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.PurchaseOrderLineInclude;

export async function listLines(user: SessionUser, f: PoListFilters, page = 1, pageSize = 50) {
  const where = lineWhere(user, f);
  const [rows, total] = await Promise.all([
    prisma.purchaseOrderLine.findMany({
      where,
      include: lineListInclude,
      orderBy: [{ purchaseOrder: { poNumber: "desc" } }, { lineNumber: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchaseOrderLine.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function getPoDetail(user: SessionUser, poId: string) {
  await assertPoAccess(user, poId);
  const supplierView = user.role === "SUPPLIER";
  return prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: {
      supplier: true,
      buyer: { select: { id: true, name: true, email: true } },
      lines: {
        orderBy: { lineNumber: "asc" },
        include: {
          deliveries: { orderBy: { deliveryDate: "desc" }, include: { createdBy: { select: { name: true } } } },
          goodsReceipts: { orderBy: { grDate: "desc" }, include: { createdBy: { select: { name: true } } } },
          followups: { orderBy: { createdAt: "desc" }, include: { assignedTo: { select: { name: true } }, completedBy: { select: { name: true } } } },
          supplierResponses: { orderBy: { createdAt: "desc" }, include: { recordedBy: { select: { name: true } } } },
        },
      },
      communications: {
        where: supplierView ? { internal: false, channel: { not: "SYSTEM" } } : {},
        orderBy: { createdAt: "asc" },
        include: { user: { select: { name: true, role: { select: { key: true } } } }, attachments: { select: { id: true, fileName: true, kind: true, sizeBytes: true } } },
      },
      attachments: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, kind: true, sizeBytes: true, mimeType: true, createdAt: true, lineId: true, uploadedBy: { select: { name: true } } } },
    },
  });
}

// ─────────────────────────── Create / update ───────────────────────────

function lineData(l: PoLineInput) {
  return {
    lineNumber: l.lineNumber,
    materialNumber: l.materialNumber,
    materialDescription: l.materialDescription,
    plant: l.plant,
    storageLocation: l.storageLocation,
    uom: l.uom,
    unitPrice: l.unitPrice,
    orderedQty: l.orderedQty,
    outstandingQty: l.orderedQty,
    originalRequestedDate: toDateOnly(l.originalRequestedDate)!,
    remarks: l.remarks,
  };
}

export async function createPo(user: SessionUser, input: PoCreateInput) {
  const lineNos = input.lines.map((l) => l.lineNumber);
  if (new Set(lineNos).size !== lineNos.length) throw new HttpError(422, "Duplicate line numbers");
  const exists = await prisma.purchaseOrder.findUnique({ where: { poNumber: input.poNumber } });
  if (exists) throw new HttpError(409, `PO ${input.poNumber} already exists`);

  const sent = toDateOnly(input.poSentDate);
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber: input.poNumber,
        supplierId: input.supplierId,
        buyerId: input.buyerId || user.id,
        currency: input.currency,
        poCreationDate: toDateOnly(input.poCreationDate)!,
        poSentDate: sent,
        supplierReceiptStatus: sent ? "PENDING" : "NOT_SENT",
        status: sent ? "SENT" : "DRAFT",
        remarks: input.remarks,
        lines: { create: input.lines.map(lineData) },
      },
      include: { lines: true },
    });
    await audit(tx, { entityType: "PurchaseOrder", entityId: po.id, poNumber: po.poNumber, action: "CREATE", after: `${po.lines.length} line(s)`, userId: user.id });
    for (const l of po.lines) await recalcLine(tx, l.id, { userId: user.id });
    if (sent) await notifySupplierUsers(po.supplierId, { title: `New PO ${po.poNumber}`, body: "Please acknowledge receipt and confirm delivery dates.", link: `/portal/po/${po.id}` });
    return po;
  });
}

export async function updatePo(user: SessionUser, poId: string, input: { supplierId?: string; buyerId?: string; poSentDate?: string | null; remarks?: string | null; lines?: PoLineInput[] }) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { lines: true } });
  if (po.archivedAt) throw new HttpError(409, "Archived POs are read-only. Restore it first.");
  return prisma.$transaction(async (tx) => {
    const header: Record<string, unknown> = {};
    if (input.supplierId !== undefined) header.supplierId = input.supplierId;
    if (input.buyerId !== undefined) header.buyerId = input.buyerId;
    if (input.remarks !== undefined) header.remarks = input.remarks;
    if (input.poSentDate !== undefined) header.poSentDate = toDateOnly(input.poSentDate);
    if (Object.keys(header).length) {
      await tx.purchaseOrder.update({ where: { id: poId }, data: header });
      await auditDiff(tx, { entityType: "PurchaseOrder", entityId: poId, poNumber: po.poNumber, action: "UPDATE", userId: user.id }, po as unknown as Record<string, unknown>, header);
    }
    for (const l of input.lines ?? []) {
      const existing = l.id ? po.lines.find((x) => x.id === l.id) : po.lines.find((x) => x.lineNumber === l.lineNumber);
      if (existing) {
        const ordered = l.orderedQty;
        if (ordered < Number(existing.receivedQty)) throw new HttpError(422, `Line ${l.lineNumber}: ordered qty cannot be below received qty (${existing.receivedQty})`);
        const data = {
          materialNumber: l.materialNumber, materialDescription: l.materialDescription, plant: l.plant, storageLocation: l.storageLocation,
          uom: l.uom, unitPrice: l.unitPrice, orderedQty: ordered, originalRequestedDate: toDateOnly(l.originalRequestedDate)!, remarks: l.remarks,
        };
        await tx.purchaseOrderLine.update({ where: { id: existing.id }, data });
        await auditDiff(tx, { entityType: "PurchaseOrderLine", entityId: existing.id, poNumber: po.poNumber, action: "UPDATE", userId: user.id }, existing as unknown as Record<string, unknown>, data);
        await recalcLine(tx, existing.id, { userId: user.id });
        await syncLineFollowup(tx, existing.id, { userId: user.id });
      } else {
        const created = await tx.purchaseOrderLine.create({ data: { ...lineData(l), purchaseOrderId: poId } });
        await audit(tx, { entityType: "PurchaseOrderLine", entityId: created.id, poNumber: po.poNumber, action: "CREATE", userId: user.id });
        await recalcLine(tx, created.id, { userId: user.id });
      }
    }
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
  });
}

/** Mark PO as sent to supplier (if not already) and notify portal users */
export async function sendPoToSupplier(user: SessionUser, poId: string) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
  if (po.poSentDate) return po;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.purchaseOrder.update({ where: { id: poId }, data: { poSentDate: today(), supplierReceiptStatus: "PENDING", status: "SENT" } });
    await audit(tx, { entityType: "PurchaseOrder", entityId: poId, poNumber: po.poNumber, action: "STATUS_CHANGE", field: "poSentDate", after: today(), userId: user.id });
    await tx.communication.create({ data: { purchaseOrderId: poId, userId: user.id, channel: "SYSTEM", message: `PO released to supplier by ${user.name}` } });
    await notifySupplierUsers(po.supplierId, { title: `New PO ${po.poNumber}`, body: "Please acknowledge receipt and confirm delivery dates.", link: `/portal/po/${po.id}` });
    return updated;
  });
}

export async function archivePo(user: SessionUser, poId: string, reason: string, restore = false) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
  return prisma.$transaction(async (tx) => {
    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: restore ? { archivedAt: null, archivedBy: null } : { archivedAt: new Date(), archivedBy: user.id },
    });
    if (!restore) {
      await tx.followup.updateMany({ where: { line: { purchaseOrderId: poId }, status: "OPEN" }, data: { status: "CANCELLED", outcome: "PO archived" } });
    }
    await audit(tx, { entityType: "PurchaseOrder", entityId: poId, poNumber: po.poNumber, action: restore ? "RESTORE" : "ARCHIVE", reason, userId: user.id });
    return updated;
  });
}

/** Short-close: mark every open line CLOSED (via override) – PO then auto-closes */
export async function closePo(user: SessionUser, poId: string, reason: string) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId }, include: { lines: true } });
  return prisma.$transaction(async (tx) => {
    for (const l of po.lines) {
      if (l.status === "FULLY_RECEIVED" || l.status === "CLOSED") continue;
      await tx.purchaseOrderLine.update({ where: { id: l.id }, data: { statusOverride: "CLOSED" } });
      await audit(tx, { entityType: "PurchaseOrderLine", entityId: l.id, poNumber: po.poNumber, action: "OVERRIDE", field: "status", before: l.status, after: "CLOSED", reason, userId: user.id });
      await recalcLine(tx, l.id, { userId: user.id });
    }
    return tx.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
  });
}

export function nextWeek() {
  return addDays(today(), 7);
}
