"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CheckCheck, Loader2, Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/client-api";
import { EmailComposer } from "./email-composer";
import type { Perms } from "@/types";

type Po = { id: string; poNumber: string; poSentDate: string | null; supplierReceiptStatus: string; status: string; archivedAt: string | null };

export function PoActions({ po, perms }: { po: Po; perms: Perms }) {
  const router = useRouter();
  const [reasonFor, setReasonFor] = useState<null | "archive" | "restore" | "close">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function run(action: string, body?: unknown) {
    setBusy(action);
    try {
      await api(`/api/purchase-orders/${po.id}/${action}`, { method: "POST", body: body ?? {} });
      toast.success(
        { send: "PO released to supplier", acknowledge: "Receipt acknowledged", archive: "PO archived", restore: "PO restored", close: "PO closed" }[action] ?? "Done",
      );
      setReasonFor(null);
      setReason("");
      router.refresh();
    } catch {
      /* toast shown */
    } finally {
      setBusy(null);
    }
  }

  const open = !po.archivedAt && po.status !== "CLOSED";

  return (
    <div className="flex flex-wrap gap-2">
      {perms.edit && open && !po.poSentDate && (
        <Button size="sm" onClick={() => run("send")} disabled={!!busy}>
          {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Release to supplier
        </Button>
      )}
      {perms.edit && open && po.poSentDate && po.supplierReceiptStatus !== "ACKNOWLEDGED" && (
        <Button size="sm" variant="outline" onClick={() => run("acknowledge", { remarks: "Recorded by buyer" })} disabled={!!busy}>
          <CheckCheck /> Mark acknowledged
        </Button>
      )}
      {perms.email && open && po.poSentDate && <EmailComposer poId={po.id} />}
      {perms.close && open && po.poSentDate && (
        <Button size="sm" variant="outline" onClick={() => setReasonFor("close")}>
          <Lock /> Close PO
        </Button>
      )}
      {perms.archive && !po.archivedAt && (
        <Button size="sm" variant="ghost" onClick={() => setReasonFor("archive")}>
          <Archive /> Archive
        </Button>
      )}
      {perms.archive && po.archivedAt && (
        <Button size="sm" variant="outline" onClick={() => setReasonFor("restore")}>
          <ArchiveRestore /> Restore
        </Button>
      )}

      <Dialog open={!!reasonFor} onOpenChange={(o) => !o && setReasonFor(null)}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (reasonFor) run(reasonFor, { reason });
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {reasonFor === "archive" ? `Archive PO ${po.poNumber}?` : reasonFor === "restore" ? `Restore PO ${po.poNumber}?` : `Close PO ${po.poNumber}?`}
              </DialogTitle>
              <DialogDescription>
                {reasonFor === "archive"
                  ? "Archived POs are hidden from trackers and follow-ups, but nothing is deleted. You can restore it any time."
                  : reasonFor === "close"
                    ? "All lines that are not fully received will be short-closed. Open follow-ups are cancelled."
                    : "The PO returns to the active tracker."}
              </DialogDescription>
            </DialogHeader>
            <Field label="Reason *">
              <Textarea required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReasonFor(null)}>Cancel</Button>
              <Button type="submit" variant={reasonFor === "restore" ? "default" : "destructive"} disabled={!!busy}>
                {busy && <Loader2 className="animate-spin" />} Confirm
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
