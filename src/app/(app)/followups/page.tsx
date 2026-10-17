import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CalendarCheck, CalendarDays, Timer } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { addDays, effectiveDate, fmtDate, today, diffDays } from "@/lib/dates";
import { fmtQty } from "@/lib/utils";
import { followupBuckets } from "@/services/followup-service";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, EmptyState, Table, TBody, TD, TH, THead, TR, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { EmailComposer } from "@/components/po/email-composer";
import { CompleteFollowup, RunSchedulerButton } from "@/components/followup-actions";

export const metadata = { title: "Follow-ups" };

const BUCKETS = [
  { key: "all", label: "All open" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
];

export default async function FollowupsPage({ searchParams }: { searchParams: Promise<{ bucket?: string; mine?: string }> }) {
  const user = await requirePageUser("followup:manage");
  const { bucket = "all", mine } = await searchParams;
  const t = today();
  const scope: Prisma.FollowupWhereInput = { line: { purchaseOrder: { archivedAt: null } }, ...(mine === "1" ? { assignedToId: user.id } : {}) };
  const where: Prisma.FollowupWhereInput = { ...scope, status: "OPEN" };
  if (bucket === "overdue") where.dueDate = { lt: t };
  if (bucket === "today") where.dueDate = t;
  if (bucket === "tomorrow") where.dueDate = addDays(t, 1);
  if (bucket === "week") where.dueDate = { gte: t, lte: addDays(t, 7) };

  const [counts, items] = await Promise.all([
    followupBuckets(scope),
    prisma.followup.findMany({
      where,
      orderBy: { dueDate: "asc" },
      take: 300,
      include: {
        assignedTo: { select: { name: true } },
        line: { include: { purchaseOrder: { select: { id: true, poNumber: true, supplier: { select: { name: true } } } } } },
      },
    }),
  ]);
  const qs = (b: string) => `?bucket=${b}${mine === "1" ? "&mine=1" : ""}`;

  return (
    <>
      <PageHeader
        title="Follow-up worklist"
        description="Generated automatically 7 days before the supplier date; recalculated whenever the date is revised."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={mine === "1" ? `?bucket=${bucket}` : `?bucket=${bucket}&mine=1`}>{mine === "1" ? "Everyone's" : "Only mine"}</Link>
            </Button>
            {user.role === "ADMIN" && <RunSchedulerButton />}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Overdue" value={counts.overdue} icon={Timer} tone="red" href={qs("overdue")} />
        <KpiCard label="Due today" value={counts.dueToday} icon={CalendarCheck} tone="amber" href={qs("today")} />
        <KpiCard label="Due tomorrow" value={counts.dueTomorrow} icon={CalendarDays} href={qs("tomorrow")} />
        <KpiCard label="Due this week" value={counts.dueThisWeek} icon={CalendarDays} href={qs("week")} />
      </div>

      <div className="mt-4 flex flex-wrap gap-1">
        {BUCKETS.map((b) => (
          <Button key={b.key} asChild size="sm" variant={bucket === b.key ? "default" : "ghost"}>
            <Link href={qs(b.key)}>{b.label}</Link>
          </Button>
        ))}
      </div>

      <Card className="mt-3 overflow-hidden">
        {items.length === 0 ? (
          <div className="p-6"><EmptyState title="Nothing to chase here" description="Follow-ups appear when suppliers confirm delivery dates." /></div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Due</TH><TH>PO / Line</TH><TH>Supplier</TH><TH>Material</TH><TH className="text-right">Pending</TH><TH>Supplier date</TH><TH>Type</TH><TH>Owner</TH><TH />
              </TR>
            </THead>
            <TBody>
              {items.map((f) => {
                const late = diffDays(t, f.dueDate);
                const po = f.line.purchaseOrder;
                return (
                  <TR key={f.id}>
                    <TD className="whitespace-nowrap">
                      <span className={late > 0 ? "font-semibold text-destructive" : late === 0 ? "font-semibold text-amber-600" : ""}>{fmtDate(f.dueDate)}</span>
                      {late > 0 && <span className="block text-[10px] text-destructive">{late} d overdue</span>}
                    </TD>
                    <TD className="whitespace-nowrap">
                      <Link href={`/purchase-orders/${po.id}?tab=followups`} className="font-medium text-primary hover:underline">{po.poNumber}</Link> / {f.line.lineNumber}
                    </TD>
                    <TD className="max-w-[180px] truncate">{po.supplier.name}</TD>
                    <TD className="max-w-[220px] truncate">{f.line.materialDescription}</TD>
                    <TD className="num text-right">{fmtQty(f.line.outstandingQty)} {f.line.uom}</TD>
                    <TD className="whitespace-nowrap">{fmtDate(effectiveDate(f.line))}</TD>
                    <TD><Badge tone={f.source === "AUTO" ? "blue" : "neutral"}>{f.source === "AUTO" ? "Auto" : "Manual"}</Badge></TD>
                    <TD className="text-xs">{f.assignedTo?.name ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-right">
                      <EmailComposer poId={po.id} lineId={f.line.id} followupId={f.id} label="Email" variant="ghost" />
                      <CompleteFollowup id={f.id} label={`PO ${po.poNumber}/${f.line.lineNumber} · ${po.supplier.name}`} />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
