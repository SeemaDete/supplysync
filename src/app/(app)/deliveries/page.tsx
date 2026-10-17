import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { addDays, effectiveDate, today } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { Card, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { DeliveryWorklist, type WorklistRow } from "@/components/delivery-worklist";
import { toPlain } from "@/types";

export const metadata = { title: "Deliveries & GR" };

const VIEWS = [
  { key: "inbound", label: "Expected in 14 days" },
  { key: "grpending", label: "GR pending" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All open" },
];

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requirePageUser("delivery:record");
  const { view = "inbound" } = await searchParams;
  const t = today();

  const lines = await prisma.purchaseOrderLine.findMany({
    where: {
      purchaseOrder: { archivedAt: null, status: { in: ["SENT", "OPEN"] } },
      status: { notIn: ["CLOSED", "FULLY_RECEIVED"] },
    },
    include: {
      deliveries: { orderBy: { deliveryDate: "desc" } },
      goodsReceipts: true, followups: true, supplierResponses: true,
      purchaseOrder: { select: { id: true, poNumber: true, supplier: { select: { name: true } } } },
    },
    take: 1000,
  });

  const rows = lines
    .map((l) => {
      const exp = effectiveDate(l);
      return { l, exp, late: exp < t && Number(l.deliveredQty) < Number(l.orderedQty), pendingGr: Number(l.deliveredQty) > Number(l.receivedQty) };
    })
    .filter(({ l, exp, late, pendingGr }) => {
      if (view === "grpending") return pendingGr;
      if (view === "overdue") return late;
      if (view === "inbound") return Number(l.deliveredQty) < Number(l.orderedQty) && exp <= addDays(t, 14);
      return true;
    })
    .sort((a, b) => a.exp.getTime() - b.exp.getTime())
    .map(({ l, exp, late }) => {
      const { purchaseOrder, ...line } = l;
      return { ...toPlain(line), poId: purchaseOrder.id, poNumber: purchaseOrder.poNumber, supplierName: purchaseOrder.supplier.name, expected: exp.toISOString(), late } as unknown as WorklistRow;
    });

  return (
    <>
      <PageHeader title="Deliveries & goods receipt" description="Inbound worklist for logistics and stores. Partial and multiple deliveries/GRs are supported." />
      <div className="mb-3 flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <Button key={v.key} asChild size="sm" variant={view === v.key ? "default" : "ghost"}>
            <Link href={`?view=${v.key}`}>{v.label}</Link>
          </Button>
        ))}
      </div>
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-6"><EmptyState title="Nothing in this view" /></div>
        ) : (
          <DeliveryWorklist rows={rows} canDeliver={can(user.role, "delivery:record")} canGr={can(user.role, "gr:post")} />
        )}
      </Card>
    </>
  );
}
