"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, CalendarClock, ClipboardEdit, MoreHorizontal, PackageCheck, ShieldAlert, Truck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/client-api";
import { fmtQty, num } from "@/lib/utils";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import type { Perms, PoDetailDTO, PoLineDTO } from "@/types";
import { LineActionDialog, type LineAction } from "./line-dialogs";
import { CommThread } from "./comm-thread";
import { Attachments } from "./attachments";
import { EmailComposer } from "./email-composer";

type AuditRow = { id: string; createdAt: string; action: string; entityType: string; field: string | null; beforeValue: string | null; afterValue: string | null; reason: string | null; user: { name: string } | null };

export function PoWorkspace({ po, perms, audit, currentUserName }: { po: PoDetailDTO; perms: Perms; audit: AuditRow[]; currentUserName: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [dialog, setDialog] = useState<{ line: PoLineDTO; action: LineAction } | null>(null);
  const editable = !po.archivedAt;

  async function reverseGr(id: string) {
    const reason = window.prompt("Reason for reversing this GR (min 3 characters):");
    if (!reason || reason.trim().length < 3) return;
    try {
      await api(`/api/goods-receipts/${id}/reverse`, { body: { reason } });
      toast.success("GR reversed");
      router.refresh();
    } catch {
      /* toast */
    }
  }

  const allDeliveries = po.lines.flatMap((l) => l.deliveries.map((d) => ({ ...d, line: l })));
  const allGrs = po.lines.flatMap((l) => l.goodsReceipts.map((g) => ({ ...g, line: l })));
  const allFollowups = po.lines.flatMap((l) => l.followups.map((f) => ({ ...f, line: l })));
  const allResponses = po.lines.flatMap((l) => l.supplierResponses.map((r) => ({ ...r, line: l })));

  return (
    <>
      <Tabs defaultValue={sp.get("tab") ?? "lines"}>
        <TabsList>
          <TabsTrigger value="lines">Lines ({po.lines.length})</TabsTrigger>
          <TabsTrigger value="deliveries">Deliveries & GR ({allDeliveries.length})</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups ({allFollowups.length})</TabsTrigger>
          <TabsTrigger value="responses">Supplier responses ({allResponses.length})</TabsTrigger>
          <TabsTrigger value="communication">Communication ({po.communications.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({po.attachments.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        {/* ───────── Lines ───────── */}
        <TabsContent value="lines" className="rounded-lg border bg-card">
          <Table>
            <THead>
              <TR>
                <TH>Line</TH>
                <TH>Material</TH>
                <TH>Plant/SLoc</TH>
                <TH className="text-right">Ordered</TH>
                <TH className="text-right">Dispatched</TH>
                <TH className="text-right">Delivered</TH>
                <TH className="text-right">Received</TH>
                <TH className="text-right">Pending GR</TH>
                <TH className="text-right">Outstanding</TH>
                <TH>Requested</TH>
                <TH>Confirmed</TH>
                <TH>Revised</TH>
                <TH>Follow-up</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {po.lines.map((l) => {
                const pendingGr = Math.max(num(l.deliveredQty) - num(l.receivedQty), 0);
                const done = l.status === "CLOSED" || l.status === "FULLY_RECEIVED";
                return (
                  <TR key={l.id}>
                    <TD className="font-medium">{l.lineNumber}</TD>
                    <TD className="max-w-[240px]">
                      <p className="truncate">{l.materialDescription}</p>
                      <p className="text-xs text-muted-foreground">{l.materialNumber}{l.remarks ? ` · ${l.remarks}` : ""}</p>
                    </TD>
                    <TD>{l.plant}{l.storageLocation ? ` / ${l.storageLocation}` : ""}</TD>
                    <TD className="num whitespace-nowrap text-right">{fmtQty(l.orderedQty)} <span className="text-xs text-muted-foreground">{l.uom}</span></TD>
                    <TD className="num text-right">{fmtQty(l.dispatchedQty)}</TD>
                    <TD className="num text-right">{fmtQty(l.deliveredQty)}</TD>
                    <TD className="num text-right">{fmtQty(l.receivedQty)}</TD>
                    <TD className="num text-right">{pendingGr ? <span className="font-medium text-amber-600">{fmtQty(pendingGr)}</span> : "0"}</TD>
                    <TD className="num text-right font-semibold">{fmtQty(l.outstandingQty)}</TD>
                    <TD className="whitespace-nowrap">{fmtDate(l.originalRequestedDate)}</TD>
                    <TD className="whitespace-nowrap">{fmtDate(l.supplierConfirmedDate)}</TD>
                    <TD className="whitespace-nowrap">{l.latestRevisedDate ? <span className="font-medium text-amber-600">{fmtDate(l.latestRevisedDate)}</span> : "—"}</TD>
                    <TD className="whitespace-nowrap text-xs">
                      {fmtDate(l.nextFollowupDate)}
                      {l.lastFollowupDate && <span className="block text-muted-foreground">last {fmtDate(l.lastFollowupDate)}</span>}
                    </TD>
                    <TD>
                      <StatusBadge status={l.status} />
                      {l.statusOverride && <Badge className="ml-1" tone="violet">manual</Badge>}
                    </TD>
                    <TD>
                      {editable && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Line actions"><MoreHorizontal /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {perms.response && !done && <DropdownMenuItem onSelect={() => setDialog({ line: l, action: "response" })}><ClipboardEdit /> Record supplier response</DropdownMenuItem>}
                            {perms.response && !done && <DropdownMenuItem onSelect={() => setDialog({ line: l, action: "confirm" })}><CalendarCheck /> Enter confirmed date</DropdownMenuItem>}
                            {perms.response && !done && <DropdownMenuItem onSelect={() => setDialog({ line: l, action: "revise" })}><CalendarClock /> Enter revised date</DropdownMenuItem>}
                            {perms.delivery && !done && num(l.deliveredQty) < num(l.orderedQty) && <DropdownMenuItem onSelect={() => setDialog({ line: l, action: "delivery" })}><Truck /> Record delivery</DropdownMenuItem>}
                            {perms.gr && pendingGr > 0 && <DropdownMenuItem onSelect={() => setDialog({ line: l, action: "gr" })}><PackageCheck /> Post GR</DropdownMenuItem>}
                            {perms.override && <DropdownMenuItem onSelect={() => setDialog({ line: l, action: "override" })}><ShieldAlert /> Manual override</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TabsContent>

        {/* ───────── Deliveries & GR ───────── */}
        <TabsContent value="deliveries" className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-card">
            <p className="border-b px-4 py-2 text-sm font-semibold">Deliveries</p>
            <Table>
              <THead><TR><TH>Line</TH><TH>Delivery note</TH><TH>ASN</TH><TH>Date</TH><TH className="text-right">Qty</TH><TH>By</TH></TR></THead>
              <TBody>
                {allDeliveries.length === 0 && <TR><TD colSpan={6} className="text-center text-muted-foreground">No deliveries yet</TD></TR>}
                {allDeliveries.map((d) => (
                  <TR key={d.id}>
                    <TD>{d.line.lineNumber}</TD><TD>{d.deliveryNote}</TD><TD>{d.asnNumber ?? "—"}</TD><TD>{fmtDate(d.deliveryDate)}</TD>
                    <TD className="num text-right">{fmtQty(d.quantity)} {d.line.uom}</TD><TD className="text-xs">{d.createdBy?.name}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <div className="rounded-lg border bg-card">
            <p className="border-b px-4 py-2 text-sm font-semibold">Goods receipts</p>
            <Table>
              <THead><TR><TH>Line</TH><TH>GR no.</TH><TH>Date</TH><TH className="text-right">Qty</TH><TH>By</TH><TH /></TR></THead>
              <TBody>
                {allGrs.length === 0 && <TR><TD colSpan={6} className="text-center text-muted-foreground">No GRs posted</TD></TR>}
                {allGrs.map((g) => (
                  <TR key={g.id} className={g.reversed ? "opacity-50 line-through" : ""}>
                    <TD>{g.line.lineNumber}</TD><TD>{g.grNumber}</TD><TD>{fmtDate(g.grDate)}</TD>
                    <TD className="num text-right">{fmtQty(g.quantity)} {g.line.uom}</TD><TD className="text-xs">{g.createdBy?.name}</TD>
                    <TD>{perms.gr && !g.reversed && editable && <Button variant="ghost" size="sm" onClick={() => reverseGr(g.id)}><Undo2 /> Reverse</Button>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </TabsContent>

        {/* ───────── Follow-ups ───────── */}
        <TabsContent value="followups" className="rounded-lg border bg-card">
          <Table>
            <THead><TR><TH>Line</TH><TH>Supplier date</TH><TH>Due</TH><TH>Source</TH><TH>Status</TH><TH>Owner</TH><TH>Outcome</TH><TH /></TR></THead>
            <TBody>
              {allFollowups.length === 0 && <TR><TD colSpan={8} className="text-center text-muted-foreground">Follow-ups appear once the supplier confirms a delivery date.</TD></TR>}
              {allFollowups
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((f) => (
                  <TR key={f.id}>
                    <TD>{f.line.lineNumber}</TD><TD>{fmtDate(f.targetDate)}</TD><TD className="font-medium">{fmtDate(f.dueDate)}</TD>
                    <TD><Badge tone={f.source === "AUTO" ? "blue" : "neutral"}>{f.source === "AUTO" ? "Auto" : "Manual"}</Badge></TD>
                    <TD><StatusBadge status={f.status} /></TD>
                    <TD className="text-xs">{f.assignedTo?.name ?? "—"}</TD>
                    <TD className="max-w-[260px] text-xs">{f.outcome ?? "—"}{f.completedBy ? ` · ${f.completedBy.name}` : ""}</TD>
                    <TD>{f.status === "OPEN" && perms.email && editable && <EmailComposer poId={po.id} lineId={f.line.id} followupId={f.id} label="Send" variant="ghost" />}</TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </TabsContent>

        {/* ───────── Supplier responses / revision history ───────── */}
        <TabsContent value="responses" className="rounded-lg border bg-card">
          <Table>
            <THead><TR><TH>Line</TH><TH>Date</TH><TH>Received</TH><TH>Confirmed</TH><TH>Previous → New</TH><TH>Delay reason</TH><TH>Comments</TH><TH>Next action</TH><TH>By</TH></TR></THead>
            <TBody>
              {allResponses.length === 0 && <TR><TD colSpan={9} className="text-center text-muted-foreground">No responses recorded</TD></TR>}
              {allResponses
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((r) => (
                  <TR key={r.id}>
                    <TD>{r.line.lineNumber}</TD><TD>{fmtDate(r.responseDate)}</TD>
                    <TD>{r.responseReceived ? <Badge tone="green">Yes</Badge> : <Badge tone="red">No</Badge>}</TD>
                    <TD>{r.deliveryConfirmed ? "Yes" : "No"}</TD>
                    <TD className="whitespace-nowrap">{r.previousDate ? `${fmtDate(r.previousDate)} → ` : ""}{fmtDate(r.revisedDate ?? r.confirmedDate)}</TD>
                    <TD className="text-xs">{r.delayReason ?? "—"}</TD>
                    <TD className="max-w-[220px] text-xs">{r.supplierComments ?? "—"}</TD>
                    <TD className="text-xs">{r.nextAction ?? "—"}</TD>
                    <TD className="text-xs">{r.recordedBy?.name}{r.viaPortal ? " (portal)" : ""}</TD>
                  </TR>
                ))}
            </TBody>
          </Table>
        </TabsContent>

        <TabsContent value="communication">
          <CommThread poId={po.id} items={po.communications} currentUserName={currentUserName} canComment={perms.comment} canInternal={!perms.supplier} />
        </TabsContent>

        <TabsContent value="documents">
          <Attachments poId={po.id} items={po.attachments} lines={po.lines.map((l) => ({ id: l.id, lineNumber: l.lineNumber }))} canUpload={perms.upload && editable} kinds={["PO_DOCUMENT", "DELIVERY_NOTE", "ASN", "INVOICE", "GR_DOCUMENT", "OTHER"]} />
        </TabsContent>

        <TabsContent value="audit" className="rounded-lg border bg-card">
          <Table>
            <THead><TR><TH>When</TH><TH>User</TH><TH>Action</TH><TH>Object</TH><TH>Field</TH><TH>Before</TH><TH>After</TH><TH>Reason</TH></TR></THead>
            <TBody>
              {audit.map((a) => (
                <TR key={a.id}>
                  <TD className="whitespace-nowrap text-xs">{fmtDateTime(a.createdAt)}</TD>
                  <TD className="text-xs">{a.user?.name ?? "System"}</TD>
                  <TD><Badge tone={a.action === "OVERRIDE" ? "red" : "neutral"}>{a.action}</Badge></TD>
                  <TD className="text-xs">{a.entityType}</TD>
                  <TD className="text-xs">{a.field ?? "—"}</TD>
                  <TD className="max-w-[160px] truncate text-xs">{a.beforeValue ?? "—"}</TD>
                  <TD className="max-w-[160px] truncate text-xs">{a.afterValue ?? "—"}</TD>
                  <TD className="max-w-[220px] text-xs">{a.reason ?? ""}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TabsContent>
      </Tabs>

      {dialog && <LineActionDialog line={dialog.line} action={dialog.action} onClose={() => setDialog(null)} />}
    </>
  );
}
