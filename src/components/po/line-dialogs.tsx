"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/client-api";
import { num } from "@/lib/utils";
import type { PoLineDTO } from "@/types";

export type LineAction = "confirm" | "revise" | "dispatch" | "response" | "delivery" | "gr" | "override";

const todayStr = () => new Date().toISOString().slice(0, 10);

const TITLES: Record<LineAction, string> = {
  confirm: "Confirm delivery date",
  revise: "Revise delivery date",
  dispatch: "Update dispatched quantity",
  response: "Record supplier response",
  delivery: "Record delivery",
  gr: "Post goods receipt",
  override: "Manual override",
};

const DELAY_REASONS = ["Raw material shortage", "Machine breakdown", "Capacity constraint", "Quality rework", "Transport delay", "Payment hold", "Other"];

/**
 * One dialog component for every line-level action. Each action posts to /api/lines/:id/:action
 * and refreshes the page so server-calculated status/quantities are shown.
 */
export function LineActionDialog({ line, action, onClose }: { line: PoLineDTO; action: LineAction | null; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Record<string, string | boolean>>({});
  const v = (k: string, d = "") => (f[k] as string) ?? d;
  const set = (k: string, val: string | boolean) => setF((x) => ({ ...x, [k]: val }));

  const ordered = num(line.orderedQty);
  const delivered = num(line.deliveredQty);
  const received = num(line.receivedQty);
  const maxDelivery = Math.max(ordered - delivered, 0);
  const maxGr = Math.max(Math.min(delivered, ordered) - received, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!action) return;
    setBusy(true);
    let body: Record<string, unknown> = {};
    switch (action) {
      case "confirm":
        body = { confirmedDate: v("date"), remarks: v("remarks") };
        break;
      case "revise":
        body = { revisedDate: v("date"), delayReason: v("reason") === "Other" ? v("reasonOther") : v("reason"), remarks: v("remarks") };
        break;
      case "dispatch":
        body = { dispatchedQty: Number(v("qty", String(num(line.dispatchedQty)))), remarks: v("remarks") };
        break;
      case "response":
        body = {
          responseReceived: f.responseReceived !== false,
          responseDate: v("responseDate", todayStr()),
          deliveryConfirmed: Boolean(f.deliveryConfirmed),
          confirmedDate: v("outcome") === "confirm" ? v("date") : null,
          revisedDate: v("outcome") === "revise" ? v("date") : null,
          delayReason: v("reason"),
          supplierComments: v("comments"),
          nextAction: v("nextAction"),
          nextFollowupDate: v("nextFollowupDate"),
        };
        break;
      case "delivery":
        body = { deliveryNote: v("deliveryNote"), asnNumber: v("asn"), deliveryDate: v("date", todayStr()), quantity: Number(v("qty")), remarks: v("remarks") };
        break;
      case "gr":
        body = { grNumber: v("grNumber"), grDate: v("date", todayStr()), quantity: Number(v("qty")), deliveryRecordId: v("deliveryId") || null, remarks: v("remarks") };
        break;
      case "override":
        body = { field: v("field", "latestRevisedDate"), value: v("value") || null, reason: v("reason") };
        break;
    }
    try {
      await api(`/api/lines/${line.id}/${action}`, { body });
      toast.success(`${TITLES[action]} – saved`);
      setF({});
      onClose();
      router.refresh();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  }

  const overrideField = v("field", "latestRevisedDate");

  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {action && (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{TITLES[action]}</DialogTitle>
              <DialogDescription>
                Line {line.lineNumber} · {line.materialNumber} – {line.materialDescription}
              </DialogDescription>
            </DialogHeader>

            {action === "confirm" && (
              <>
                <Field label="Confirmed delivery date *">
                  <Input type="date" required value={v("date")} onChange={(e) => set("date", e.target.value)} />
                </Field>
                <Field label="Remarks">
                  <Textarea value={v("remarks")} onChange={(e) => set("remarks", e.target.value)} />
                </Field>
              </>
            )}

            {action === "revise" && (
              <>
                <Field label="New delivery date *">
                  <Input type="date" required value={v("date")} onChange={(e) => set("date", e.target.value)} />
                </Field>
                <Field label="Delay reason *">
                  <Select required value={v("reason")} onChange={(e) => set("reason", e.target.value)}>
                    <option value="">Select…</option>
                    {DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}
                  </Select>
                </Field>
                {v("reason") === "Other" && (
                  <Field label="Describe the reason *">
                    <Input required value={v("reasonOther")} onChange={(e) => set("reasonOther", e.target.value)} />
                  </Field>
                )}
                <Field label="Remarks">
                  <Textarea value={v("remarks")} onChange={(e) => set("remarks", e.target.value)} />
                </Field>
              </>
            )}

            {action === "dispatch" && (
              <>
                <Field label={`Total dispatched quantity (${line.uom}) *`} hint={`Ordered ${ordered} ${line.uom}`}>
                  <Input type="number" step="any" min="0" max={ordered} required value={v("qty", String(num(line.dispatchedQty)))} onChange={(e) => set("qty", e.target.value)} />
                </Field>
                <Field label="Remarks (vehicle no., LR no., etc.)">
                  <Textarea value={v("remarks")} onChange={(e) => set("remarks", e.target.value)} />
                </Field>
              </>
            )}

            {action === "response" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Response received?">
                    <Select value={f.responseReceived === false ? "no" : "yes"} onChange={(e) => set("responseReceived", e.target.value === "yes")}>
                      <option value="yes">Yes</option>
                      <option value="no">No response</option>
                    </Select>
                  </Field>
                  <Field label="Response date">
                    <Input type="date" value={v("responseDate", todayStr())} onChange={(e) => set("responseDate", e.target.value)} />
                  </Field>
                </div>
                <Field label="Outcome">
                  <Select value={v("outcome")} onChange={(e) => { set("outcome", e.target.value); set("deliveryConfirmed", e.target.value !== ""); }}>
                    <option value="">No date change</option>
                    <option value="confirm">Supplier confirmed a date</option>
                    <option value="revise">Supplier revised the date</option>
                  </Select>
                </Field>
                {v("outcome") && (
                  <Field label={v("outcome") === "revise" ? "Revised date *" : "Confirmed date *"}>
                    <Input type="date" required value={v("date")} onChange={(e) => set("date", e.target.value)} />
                  </Field>
                )}
                {v("outcome") === "revise" && (
                  <Field label="Delay reason">
                    <Select value={v("reason")} onChange={(e) => set("reason", e.target.value)}>
                      <option value="">Select…</option>
                      {DELAY_REASONS.map((r) => <option key={r}>{r}</option>)}
                    </Select>
                  </Field>
                )}
                <Field label="Supplier comments">
                  <Textarea value={v("comments")} onChange={(e) => set("comments", e.target.value)} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Next action">
                    <Input value={v("nextAction")} onChange={(e) => set("nextAction", e.target.value)} placeholder="e.g. Call on Monday" />
                  </Field>
                  <Field label="Next follow-up date">
                    <Input type="date" value={v("nextFollowupDate")} onChange={(e) => set("nextFollowupDate", e.target.value)} />
                  </Field>
                </div>
              </>
            )}

            {action === "delivery" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Delivery note no. *">
                    <Input required value={v("deliveryNote")} onChange={(e) => set("deliveryNote", e.target.value)} />
                  </Field>
                  <Field label="ASN no.">
                    <Input value={v("asn")} onChange={(e) => set("asn", e.target.value)} />
                  </Field>
                  <Field label="Delivery date *">
                    <Input type="date" required max={todayStr()} value={v("date", todayStr())} onChange={(e) => set("date", e.target.value)} />
                  </Field>
                  <Field label={`Quantity (${line.uom}) *`} hint={`Max ${maxDelivery}`}>
                    <Input type="number" step="any" min="0" max={maxDelivery} required value={v("qty")} onChange={(e) => set("qty", e.target.value)} />
                  </Field>
                </div>
                <Field label="Remarks">
                  <Textarea value={v("remarks")} onChange={(e) => set("remarks", e.target.value)} />
                </Field>
              </>
            )}

            {action === "gr" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="GR / material document no. *">
                    <Input required value={v("grNumber")} onChange={(e) => set("grNumber", e.target.value)} placeholder="5000012345" />
                  </Field>
                  <Field label="GR date *">
                    <Input type="date" required value={v("date", todayStr())} onChange={(e) => set("date", e.target.value)} />
                  </Field>
                  <Field label={`GR quantity (${line.uom}) *`} hint={`Max ${maxGr} (delivered − received)`}>
                    <Input type="number" step="any" min="0" max={maxGr} required value={v("qty")} onChange={(e) => set("qty", e.target.value)} />
                  </Field>
                  <Field label="Against delivery">
                    <Select value={v("deliveryId")} onChange={(e) => set("deliveryId", e.target.value)}>
                      <option value="">Not linked</option>
                      {line.deliveries.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.deliveryNote} · {num(d.quantity)} {line.uom}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Remarks">
                  <Textarea value={v("remarks")} onChange={(e) => set("remarks", e.target.value)} />
                </Field>
              </>
            )}

            {action === "override" && (
              <>
                <p className="rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Overrides are for SAP/system corrections. The before value, after value, your name and the reason are written to the audit log.
                </p>
                <Field label="Field">
                  <Select value={overrideField} onChange={(e) => { set("field", e.target.value); set("value", ""); }}>
                    <option value="latestRevisedDate">Delivery date (revised)</option>
                    <option value="commitmentDate">Commitment date</option>
                    <option value="actualDeliveryDate">Actual delivery date</option>
                    <option value="status">GR / line status</option>
                    <option value="remarks">Remarks</option>
                  </Select>
                </Field>
                {overrideField === "status" ? (
                  <Field label="New status">
                    <Select value={v("value")} onChange={(e) => set("value", e.target.value)}>
                      <option value="AUTO">Automatic (remove override)</option>
                      {["OPEN", "PARTIALLY_DELIVERED", "DELIVERED", "GR_PENDING", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "OVERDUE", "DISCREPANCY", "CLOSED"].map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                      ))}
                    </Select>
                  </Field>
                ) : overrideField === "remarks" ? (
                  <Field label="New remarks">
                    <Textarea value={v("value", line.remarks ?? "")} onChange={(e) => set("value", e.target.value)} />
                  </Field>
                ) : (
                  <Field label="New date" hint="Leave empty to clear">
                    <Input type="date" value={v("value")} onChange={(e) => set("value", e.target.value)} />
                  </Field>
                )}
                <Field label="Reason *">
                  <Textarea required minLength={5} value={v("reason")} onChange={(e) => set("reason", e.target.value)} placeholder="e.g. SAP GR posted with wrong date, corrected per stores" />
                </Field>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
