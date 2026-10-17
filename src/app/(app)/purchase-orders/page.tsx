import Link from "next/link";
import { Suspense } from "react";
import { Download, FileSpreadsheet, Plus } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { listLines, type PoListFilters } from "@/services/po-service";
import { PageHeader } from "@/components/page-header";
import { PoFilters } from "@/components/po/po-filters";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Table, TBody, TD, TH, THead, TR, Badge } from "@/components/ui/primitives";
import { effectiveDate, fmtDate, today } from "@/lib/dates";
import { fmtQty } from "@/lib/utils";

export const metadata = { title: "PO Tracker" };

type SP = Record<string, string | undefined>;

export default async function PoTrackerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requirePageUser("po:view");
  const sp = await searchParams;
  const filters: PoListFilters = {
    q: sp.q, status: sp.status, supplierId: sp.supplierId, buyerId: sp.buyerId, plant: sp.plant,
    archived: sp.archived as PoListFilters["archived"], overdue: sp.overdue === "1",
  };
  const page = Math.max(1, Number(sp.page || 1));
  const [{ rows, total, pageSize }, suppliers, buyers, plants] = await Promise.all([
    listLines(user, filters, page, 50),
    prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { role: { key: { in: ["BUYER", "ADMIN"] } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.purchaseOrderLine.findMany({ distinct: ["plant"], select: { plant: true }, orderBy: { plant: "asc" } }),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const t = today();

  return (
    <>
      <PageHeader
        title="Purchase order tracker"
        description={`${total} PO line${total === 1 ? "" : "s"}${filters.overdue ? " · overdue only" : ""}`}
        actions={
          <>
            {can(user.role, "export:run") && (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/export?format=xlsx&${qs}`}><FileSpreadsheet /> Excel</a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/api/export?format=csv&${qs}`}><Download /> CSV</a>
                </Button>
              </>
            )}
            {can(user.role, "po:create") && (
              <Button asChild size="sm">
                <Link href="/purchase-orders/new"><Plus /> New PO</Link>
              </Button>
            )}
          </>
        }
      />
      <Card className="p-3">
        <Suspense>
          <PoFilters suppliers={suppliers} buyers={buyers} plants={plants.map((p) => p.plant)} />
        </Suspense>
      </Card>

      <Card className="mt-3 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-6">
            <EmptyState title="No PO lines match these filters" description="Clear the filters, or create / import purchase orders." />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>PO / Line</TH>
                <TH>Supplier</TH>
                <TH>Material</TH>
                <TH>Plant</TH>
                <TH className="text-right">Ordered</TH>
                <TH className="text-right">Delivered</TH>
                <TH className="text-right">Received</TH>
                <TH className="text-right">Open</TH>
                <TH>Ack.</TH>
                <TH>Confirmation</TH>
                <TH>Expected</TH>
                <TH>Next follow-up</TH>
                <TH>Buyer</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((l) => {
                const exp = effectiveDate(l);
                const late = Number(l.outstandingQty) > 0 && exp < t && l.status !== "CLOSED";
                return (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap">
                      <Link href={`/purchase-orders/${l.purchaseOrder.id}`} className="font-medium text-primary hover:underline">
                        {l.purchaseOrder.poNumber}
                      </Link>
                      <span className="text-muted-foreground"> / {l.lineNumber}</span>
                      {l.purchaseOrder.archivedAt && <Badge className="ml-1">Archived</Badge>}
                    </TD>
                    <TD className="max-w-[180px]">
                      <p className="truncate">{l.purchaseOrder.supplier.name}</p>
                      <p className="text-xs text-muted-foreground">{l.purchaseOrder.supplier.code}</p>
                    </TD>
                    <TD className="max-w-[240px]">
                      <p className="truncate">{l.materialDescription}</p>
                      <p className="text-xs text-muted-foreground">{l.materialNumber}</p>
                    </TD>
                    <TD className="whitespace-nowrap">{l.plant}{l.storageLocation ? ` / ${l.storageLocation}` : ""}</TD>
                    <TD className="num whitespace-nowrap text-right">{fmtQty(l.orderedQty)} <span className="text-xs text-muted-foreground">{l.uom}</span></TD>
                    <TD className="num text-right">{fmtQty(l.deliveredQty)}</TD>
                    <TD className="num text-right">{fmtQty(l.receivedQty)}</TD>
                    <TD className="num text-right font-medium">{fmtQty(l.outstandingQty)}</TD>
                    <TD><StatusBadge status={l.purchaseOrder.supplierReceiptStatus} /></TD>
                    <TD><StatusBadge status={l.confirmationStatus} /></TD>
                    <TD className={`whitespace-nowrap ${late ? "font-medium text-destructive" : ""}`}>
                      {fmtDate(exp)}
                      {l.latestRevisedDate && <span className="block text-[10px] text-muted-foreground">orig. {fmtDate(l.supplierConfirmedDate ?? l.originalRequestedDate)}</span>}
                    </TD>
                    <TD className="whitespace-nowrap">{fmtDate(l.nextFollowupDate)}</TD>
                    <TD className="whitespace-nowrap">{l.purchaseOrder.buyer.name}</TD>
                    <TD><StatusBadge status={l.status} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">Page {page} of {pages}</span>
          <Button asChild variant="outline" size="sm" disabled={page <= 1}>
            <Link href={`?${qs}&page=${Math.max(1, page - 1)}`} aria-disabled={page <= 1}>Previous</Link>
          </Button>
          <Button asChild variant="outline" size="sm" disabled={page >= pages}>
            <Link href={`?${qs}&page=${Math.min(pages, page + 1)}`} aria-disabled={page >= pages}>Next</Link>
          </Button>
        </div>
      )}
    </>
  );
}
