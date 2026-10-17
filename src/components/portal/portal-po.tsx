"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarClock, CheckCheck, Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { LineActionDialog, type LineAction } from "@/components/po/line-dialogs";
import { CommThread } from "@/components/po/comm-thread";
import { Attachments } from "@/components/po/attachments";
import { api } from "@/lib/client-api";
import { fmtQty } from "@/lib/utils";
import { fmtDate } from "@/lib/dates";
import type { PoDetailDTO, PoLineDTO } from "@/types";

export function PortalPo({ po, currentUserName }: { po: PoDetailDTO; currentUserName: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ line: PoLineDTO; action: LineAction } | null>(null);
  const [busy, setBusy] = useState(false);
  const acknowledged = po.supplierReceiptStatus === "ACKNOWLEDGED";
  const closed = po.status === "CLOSED";

  async function acknowledge() {
    setBusy(true);
    try {
      await api(`/api/purchase-orders/${po.id}/acknowledge`, { body: {} });
      toast.success("Thank you – receipt acknowledged");
      router.refresh();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {!acknowledged && !closed && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40">
          <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold">Please acknowledge receipt of this purchase order</p>
              <p className="text-sm text-muted-foreground">Then confirm a delivery date for each line.</p>
            </div>
            <Button onClick={acknowledge} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <CheckCheck />} Acknowledge PO</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Order lines</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Line</TH><TH>Material</TH><TH>Deliver to</TH><TH className="text-right">Ordered</TH><TH className="text-right">Dispatched</TH><TH className="text-right">Received</TH>
                <TH>Requested</TH><TH>Your date</TH><TH>Status</TH><TH />
              </TR>
            </THead>
            <TBody>
              {po.lines.map((l) => {
                const done = l.status === "CLOSED" || l.status === "FULLY_RECEIVED";
                const yourDate = l.latestRevisedDate ?? l.supplierConfirmedDate;
                return (
                  <TR key={l.id}>
                    <TD className="font-medium">{l.lineNumber}</TD>
                    <TD className="max-w-[240px]"><p className="truncate">{l.materialDescription}</p><p className="text-xs text-muted-foreground">{l.materialNumber}</p></TD>
                    <TD className="text-xs">Plant {l.plant}{l.storageLocation ? ` / ${l.storageLocation}` : ""}</TD>
                    <TD className="num whitespace-nowrap text-right">{fmtQty(l.orderedQty)} {l.uom}</TD>
                    <TD className="num text-right">{fmtQty(l.dispatchedQty)}</TD>
                    <TD className="num text-right">{fmtQty(l.receivedQty)}</TD>
                    <TD className="whitespace-nowrap">{fmtDate(l.originalRequestedDate)}</TD>
                    <TD className="whitespace-nowrap">{yourDate ? fmtDate(yourDate) : <span className="font-medium text-amber-600">Not confirmed</span>}</TD>
                    <TD><StatusBadge status={l.status} /></TD>
                    <TD className="whitespace-nowrap text-right">
                      {!done && acknowledged && (
                        <>
                          {!l.supplierConfirmedDate ? (
                            <Button size="sm" onClick={() => setDialog({ line: l, action: "confirm" })}><CalendarCheck /> Confirm date</Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ line: l, action: "revise" })}><CalendarClock /> Revise</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setDialog({ line: l, action: "dispatch" })}><Truck /> Dispatch</Button>
                        </>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Tabs defaultValue="messages">
        <TabsList>
          <TabsTrigger value="messages">Messages</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>
        <TabsContent value="messages">
          <CommThread poId={po.id} items={po.communications} currentUserName={currentUserName} canComment={!closed} canInternal={false} />
        </TabsContent>
        <TabsContent value="documents">
          <Attachments poId={po.id} items={po.attachments} lines={po.lines.map((l) => ({ id: l.id, lineNumber: l.lineNumber }))} canUpload={!closed} kinds={["DELIVERY_NOTE", "ASN", "INVOICE", "OTHER"]} />
        </TabsContent>
      </Tabs>

      {dialog && <LineActionDialog line={dialog.line} action={dialog.action} onClose={() => setDialog(null)} />}
    </div>
  );
}
