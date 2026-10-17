"use client";

import { useState } from "react";
import Link from "next/link";
import { PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/status-badge";
import { LineActionDialog, type LineAction } from "@/components/po/line-dialogs";
import { fmtDate } from "@/lib/dates";
import { fmtQty, num } from "@/lib/utils";
import type { PoLineDTO } from "@/types";

export type WorklistRow = PoLineDTO & { poId: string; poNumber: string; supplierName: string; expected: string; late: boolean };

export function DeliveryWorklist({ rows, canDeliver, canGr }: { rows: WorklistRow[]; canDeliver: boolean; canGr: boolean }) {
  const [dialog, setDialog] = useState<{ line: PoLineDTO; action: LineAction } | null>(null);
  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>Expected</TH><TH>PO / Line</TH><TH>Supplier</TH><TH>Material</TH><TH>Plant/SLoc</TH>
            <TH className="text-right">Ordered</TH><TH className="text-right">Dispatched</TH><TH className="text-right">Delivered</TH><TH className="text-right">Pending GR</TH><TH>Status</TH><TH />
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => {
            const pendingGr = Math.max(num(r.deliveredQty) - num(r.receivedQty), 0);
            return (
              <TR key={r.id}>
                <TD className={`whitespace-nowrap ${r.late ? "font-semibold text-destructive" : ""}`}>{fmtDate(r.expected)}</TD>
                <TD className="whitespace-nowrap"><Link className="font-medium text-primary hover:underline" href={`/purchase-orders/${r.poId}?tab=deliveries`}>{r.poNumber}</Link> / {r.lineNumber}</TD>
                <TD className="max-w-[160px] truncate">{r.supplierName}</TD>
                <TD className="max-w-[220px]"><p className="truncate">{r.materialDescription}</p><p className="text-xs text-muted-foreground">{r.materialNumber}</p></TD>
                <TD>{r.plant}{r.storageLocation ? ` / ${r.storageLocation}` : ""}</TD>
                <TD className="num text-right">{fmtQty(r.orderedQty)} {r.uom}</TD>
                <TD className="num text-right">{fmtQty(r.dispatchedQty)}</TD>
                <TD className="num text-right">{fmtQty(r.deliveredQty)}</TD>
                <TD className="num text-right">{pendingGr ? <span className="font-semibold text-amber-600">{fmtQty(pendingGr)}</span> : "0"}</TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD className="whitespace-nowrap text-right">
                  {canDeliver && num(r.deliveredQty) < num(r.orderedQty) && (
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ line: r, action: "delivery" })}><Truck /> Delivery</Button>
                  )}
                  {canGr && pendingGr > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => setDialog({ line: r, action: "gr" })}><PackageCheck /> GR</Button>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {dialog && <LineActionDialog line={dialog.line} action={dialog.action} onClose={() => setDialog(null)} />}
    </>
  );
}
