import Link from "next/link";
import type { AuditAction, Prisma } from "@prisma/client";
import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fmtDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { Badge, Card, Input, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Audit log" };

const ACTIONS: AuditAction[] = ["CREATE", "UPDATE", "ARCHIVE", "RESTORE", "OVERRIDE", "STATUS_CHANGE", "IMPORT", "LOGIN"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ po?: string; action?: string; page?: string }> }) {
  await requirePageUser("audit:view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1));
  const where: Prisma.AuditLogWhereInput = {};
  if (sp.po) where.poNumber = { contains: sp.po, mode: "insensitive" };
  if (sp.action && ACTIONS.includes(sp.action as AuditAction)) where.action = sp.action as AuditAction;
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 100, take: 100, include: { user: { select: { name: true } } } }),
    prisma.auditLog.count({ where }),
  ]);

  return (
    <>
      <PageHeader title="Audit log" description={`${total} entries · every change records user, time, before, after and reason`} />
      <Card className="mb-3 p-3">
        <form className="flex flex-wrap gap-2">
          <Input name="po" placeholder="PO number" defaultValue={sp.po} className="w-48" />
          <Select name="action" defaultValue={sp.action ?? ""} className="w-44">
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a}>{a}</option>)}
          </Select>
          <Button type="submit" size="sm" variant="outline">Filter</Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <Table>
          <THead><TR><TH>When</TH><TH>User</TH><TH>Action</TH><TH>PO</TH><TH>Object</TH><TH>Field</TH><TH>Before</TH><TH>After</TH><TH>Reason</TH></TR></THead>
          <TBody>
            {rows.map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</TD>
                <TD className="text-xs">{a.user?.name ?? "System"}</TD>
                <TD><Badge tone={a.action === "OVERRIDE" ? "red" : a.action === "ARCHIVE" ? "amber" : "neutral"}>{a.action}</Badge></TD>
                <TD className="text-xs">{a.poNumber ?? "—"}</TD>
                <TD className="text-xs">{a.entityType}</TD>
                <TD className="text-xs">{a.field ?? "—"}</TD>
                <TD className="max-w-[180px] truncate text-xs" title={a.beforeValue ?? ""}>{a.beforeValue ?? "—"}</TD>
                <TD className="max-w-[180px] truncate text-xs" title={a.afterValue ?? ""}>{a.afterValue ?? "—"}</TD>
                <TD className="max-w-[240px] text-xs">{a.reason ?? ""}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <div className="mt-3 flex justify-end gap-2">
        {page > 1 && <Button asChild size="sm" variant="outline"><Link href={`?po=${sp.po ?? ""}&action=${sp.action ?? ""}&page=${page - 1}`}>Previous</Link></Button>}
        {page * 100 < total && <Button asChild size="sm" variant="outline"><Link href={`?po=${sp.po ?? ""}&action=${sp.action ?? ""}&page=${page + 1}`}>Next</Link></Button>}
      </div>
    </>
  );
}
