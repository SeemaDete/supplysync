import Link from "next/link";
import { AlertTriangle, CalendarClock, ClipboardCheck, PackageOpen } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { poScope } from "@/services/po-service";
import { effectiveDate, fmtDate, today } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Badge, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/status-badge";

export const metadata = { title: "Supplier portal" };

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requirePageUser("portal:access");
  const { show } = await searchParams;
  const supplier = user.supplierId ? await prisma.supplier.findUnique({ where: { id: user.supplierId } }) : null;
  const pos = await prisma.purchaseOrder.findMany({
    where: { ...poScope(user), ...(show === "closed" ? { status: "CLOSED" } : { status: { in: ["SENT", "OPEN"] } }) },
    orderBy: { poCreationDate: "desc" },
    include: { lines: { orderBy: { lineNumber: "asc" } }, buyer: { select: { name: true, email: true } } },
    take: 200,
  });
  const t = today();
  const allLines = pos.flatMap((p) => p.lines.map((l) => ({ ...l, po: p })));
  const toAck = pos.filter((p) => p.supplierReceiptStatus !== "ACKNOWLEDGED").length;
  const toConfirm = allLines.filter((l) => !l.supplierConfirmedDate && l.status !== "CLOSED").length;
  const overdue = allLines.filter((l) => Number(l.outstandingQty) > 0 && Number(l.deliveredQty) < Number(l.orderedQty) && effectiveDate(l) < t).length;

  return (
    <>
      <PageHeader
        title={supplier ? `Welcome, ${supplier.name}` : "Supplier portal"}
        description="Acknowledge new orders, confirm delivery dates, share dispatch details and documents."
      />
      {show !== "closed" && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Open POs" value={pos.length} icon={PackageOpen} />
          <KpiCard label="To acknowledge" value={toAck} icon={ClipboardCheck} tone={toAck ? "amber" : "green"} />
          <KpiCard label="Lines to confirm" value={toConfirm} icon={CalendarClock} tone={toConfirm ? "amber" : "green"} />
          <KpiCard label="Overdue lines" value={overdue} icon={AlertTriangle} tone={overdue ? "red" : "green"} />
        </div>
      )}
      <div className="mb-2 flex gap-3 text-sm">
        <Link href="/portal" className={show !== "closed" ? "font-semibold text-primary" : "text-muted-foreground"}>Open orders</Link>
        <Link href="/portal?show=closed" className={show === "closed" ? "font-semibold text-primary" : "text-muted-foreground"}>Completed</Link>
      </div>
      <Card className="overflow-hidden">
        {pos.length === 0 ? (
          <div className="p-6"><EmptyState title="No purchase orders here" /></div>
        ) : (
          <Table>
            <THead><TR><TH>PO</TH><TH>PO date</TH><TH>Lines</TH><TH>Next delivery</TH><TH>Receipt</TH><TH>Action needed</TH><TH>Buyer</TH></TR></THead>
            <TBody>
              {pos.map((p) => {
                const open = p.lines.filter((l) => Number(l.outstandingQty) > 0);
                const next = open.map((l) => effectiveDate(l)).sort((a, b) => a.getTime() - b.getTime())[0];
                const unconfirmed = p.lines.filter((l) => !l.supplierConfirmedDate && l.status !== "CLOSED").length;
                return (
                  <TR key={p.id}>
                    <TD><Link href={`/portal/po/${p.id}`} className="font-semibold text-primary hover:underline">{p.poNumber}</Link></TD>
                    <TD>{fmtDate(p.poCreationDate)}</TD>
                    <TD>{p.lines.length}</TD>
                    <TD className={next && next < t ? "font-medium text-destructive" : ""}>{fmtDate(next)}</TD>
                    <TD><StatusBadge status={p.supplierReceiptStatus} /></TD>
                    <TD>
                      {p.supplierReceiptStatus !== "ACKNOWLEDGED" ? <Badge tone="amber">Acknowledge</Badge> : unconfirmed ? <Badge tone="amber">Confirm {unconfirmed} line(s)</Badge> : <Badge tone="green">None</Badge>}
                    </TD>
                    <TD className="text-xs">{p.buyer.name}<span className="block text-muted-foreground">{p.buyer.email}</span></TD>
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
