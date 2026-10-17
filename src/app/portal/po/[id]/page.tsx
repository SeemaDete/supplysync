import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePageUser, HttpError } from "@/lib/session";
import { getPoDetail } from "@/services/po-service";
import { toPlain } from "@/types";
import { fmtDate } from "@/lib/dates";
import { StatusBadge } from "@/components/status-badge";
import { PortalPo } from "@/components/portal/portal-po";

export default async function PortalPoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser("portal:access");
  const { id } = await params;
  let po;
  try {
    po = await getPoDetail(user, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  return (
    <>
      <Link href="/portal" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-3 w-3" /> All orders
      </Link>
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">PO {po.poNumber}</h1>
          <StatusBadge status={po.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Issued {fmtDate(po.poCreationDate)} · Buyer {po.buyer.name} ({po.buyer.email})
        </p>
      </div>
      <PortalPo po={toPlain({ ...po, lines: po.lines.map((l) => ({ ...l, followups: [] })) })} currentUserName={user.name} />
    </>
  );
}
