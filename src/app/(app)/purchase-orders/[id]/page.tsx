import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getPoDetail } from "@/services/po-service";
import { HttpError } from "@/lib/session";
import { toPlain, type Perms } from "@/types";
import { StatusBadge } from "@/components/status-badge";
import { Badge, Card } from "@/components/ui/primitives";
import { PoActions } from "@/components/po/po-actions";
import { PoWorkspace } from "@/components/po/po-workspace";
import { fmtDate } from "@/lib/dates";
import { fmtMoney, num } from "@/lib/utils";

export default async function PoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("po:view");
  const { id } = await params;
  let po;
  try {
    po = await getPoDetail(user, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const lineIds = po.lines.map((l) => l.id);
  const audit = await prisma.auditLog.findMany({
    where: { OR: [{ poNumber: po.poNumber }, { entityId: { in: [po.id, ...lineIds] } }] },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true } } },
  });

  const c = (p: Parameters<typeof can>[1]) => can(user.role, p, { canOverride: user.canOverride });
  const perms: Perms = {
    edit: c("po:edit"), archive: c("po:archive"), close: c("po:close"), email: c("email:send"), response: c("response:record"),
    delivery: c("delivery:record"), gr: c("gr:post"), override: c("override:apply"), comment: c("comment:create"), upload: c("attachment:upload"), supplier: false,
  };
  const value = po.lines.reduce((s, l) => s + num(l.orderedQty) * num(l.unitPrice), 0);

  return (
    <>
      <Link href="/purchase-orders" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3 w-3" /> PO tracker
      </Link>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">PO {po.poNumber}</h1>
            <StatusBadge status={po.status} />
            {po.archivedAt && <Badge tone="red">Archived</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {po.supplier.name} ({po.supplier.code}) · Buyer {po.buyer.name}
          </p>
        </div>
        <PoActions po={toPlain({ id: po.id, poNumber: po.poNumber, poSentDate: po.poSentDate, supplierReceiptStatus: po.supplierReceiptStatus, status: po.status, archivedAt: po.archivedAt })} perms={perms} />
      </div>

      <Card className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Fact label="Created" value={fmtDate(po.poCreationDate)} />
        <Fact label="Sent to supplier" value={fmtDate(po.poSentDate)} />
        <Fact label="Supplier receipt" value={<><StatusBadge status={po.supplierReceiptStatus} /> <span className="text-xs text-muted-foreground">{po.supplierReceiptDate ? fmtDate(po.supplierReceiptDate) : ""}</span></>} />
        <Fact label="PO value" value={fmtMoney(value, po.currency)} />
        <Fact label="Supplier contact" value={<>{po.supplier.contactPerson ?? "—"}<span className="block text-xs text-muted-foreground">{po.supplier.email}</span></>} />
        <Fact label="Buyer" value={<>{po.buyer.name}<span className="block text-xs text-muted-foreground">{po.buyer.email}</span></>} />
        {po.remarks && <Fact label="Remarks" value={po.remarks} className="col-span-full" />}
      </Card>

      <Suspense>
        <PoWorkspace po={toPlain(po)} perms={perms} audit={toPlain(audit)} currentUserName={user.name} />
      </Suspense>
    </>
  );
}

function Fact({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
