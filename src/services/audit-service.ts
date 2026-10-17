import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isoDate } from "@/lib/dates";

type Tx = Prisma.TransactionClient | typeof prisma;

export type AuditEntry = {
  entityType: string;
  entityId: string;
  poNumber?: string | null;
  action: AuditAction;
  field?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  userId?: string | null;
};

export function auditValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isoDate(v);
  if (typeof v === "object" && "toFixed" in (v as object)) return String(v); // Prisma Decimal
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export async function audit(tx: Tx, e: AuditEntry) {
  await tx.auditLog.create({
    data: {
      entityType: e.entityType,
      entityId: e.entityId,
      poNumber: e.poNumber ?? null,
      action: e.action,
      field: e.field ?? null,
      beforeValue: auditValue(e.before),
      afterValue: auditValue(e.after),
      reason: e.reason ?? null,
      userId: e.userId ?? null,
    },
  });
}

/** Write one audit row per changed field between two objects */
export async function auditDiff(
  tx: Tx,
  base: Omit<AuditEntry, "field" | "before" | "after">,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  for (const key of Object.keys(after)) {
    const b = auditValue(before[key]);
    const a = auditValue(after[key]);
    if (b !== a) await audit(tx, { ...base, field: key, before: b, after: a });
  }
}
