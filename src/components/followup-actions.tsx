"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/client-api";

export function CompleteFollowup({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/api/followups/${id}/complete`, { body: { outcome, nextFollowupDate: next || null } });
      toast.success("Follow-up completed");
      setOpen(false);
      router.refresh();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Check /> Done</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Complete follow-up</DialogTitle>
              <DialogDescription>{label}</DialogDescription>
            </DialogHeader>
            <Field label="Outcome">
              <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Called Rakesh – dispatch confirmed for Friday" />
            </Field>
            <Field label="Schedule another follow-up on" hint="Optional – creates a manual follow-up">
              <Input type="date" value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Complete</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RunSchedulerButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await api<{ scanned: number; created: number; superseded: number; notified: number; statusRecalculated: number }>("/api/cron/followups", { method: "POST" });
      toast.success(`Scanned ${r.scanned} lines · ${r.created} follow-ups created · ${r.superseded} recalculated · ${r.notified} reminders · ${r.statusRecalculated} status changes`);
      router.refresh();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={run} disabled={busy}>
      {busy && <Loader2 className="animate-spin" />} Run follow-up engine now
    </Button>
  );
}
