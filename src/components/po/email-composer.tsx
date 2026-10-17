"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/client-api";

type Draft = { to: string; cc: string; subject: string; body: string; outlookWeb: string; mailto: string };

/**
 * Email assistant (Module 5): generates the follow-up email from the template, lets the buyer
 * preview/edit/copy, send via SMTP, or open it in Outlook. "Sent" is only recorded when SMTP accepts it.
 */
export function EmailComposer({ poId, lineId, followupId, label = "Email supplier", size = "sm", variant = "outline" }: {
  poId: string; lineId?: string | null; followupId?: string | null; label?: string; size?: "sm" | "default"; variant?: "outline" | "default" | "ghost";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  async function openComposer() {
    setOpen(true);
    setLoading(true);
    try {
      const d = await api<Draft>(`/api/purchase-orders/${poId}/email-draft${lineId ? `?lineId=${lineId}` : ""}`);
      setDraft(d);
    } catch {
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  const enc = encodeURIComponent;
  const outlookWeb = draft ? `https://outlook.office.com/mail/deeplink/compose?to=${enc(draft.to)}&cc=${enc(draft.cc)}&subject=${enc(draft.subject)}&body=${enc(draft.body)}` : "#";
  const mailto = draft ? `mailto:${draft.to}?cc=${enc(draft.cc)}&subject=${enc(draft.subject)}&body=${enc(draft.body)}` : "#";

  async function send() {
    if (!draft) return;
    setSending(true);
    try {
      await api("/api/email/send", { body: { poId, lineId, followupId, to: draft.to, cc: draft.cc, subject: draft.subject, body: draft.body } });
      toast.success("Email sent and logged in the communication history");
      setOpen(false);
      router.refresh();
    } catch {
      // The API stores the attempt as FAILED; the follow-up stays open
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  async function copy() {
    if (!draft) return;
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    toast.success("Copied to clipboard");
  }

  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={openComposer}>
        <Mail /> {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Follow-up email</DialogTitle>
            <DialogDescription>Review and edit before sending. Opening in Outlook does not mark it as sent – record the supplier&apos;s reply with “Record response”.</DialogDescription>
          </DialogHeader>
          {loading || !draft ? (
            <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="To">
                  <Input value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
                </Field>
                <Field label="Cc">
                  <Input value={draft.cc} onChange={(e) => setDraft({ ...draft, cc: e.target.value })} />
                </Field>
              </div>
              <Field label="Subject">
                <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              </Field>
              <Field label="Body">
                <Textarea rows={14} className="font-mono text-xs" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              </Field>
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!draft}><Copy /> Copy</Button>
              <Button asChild variant="outline" size="sm">
                <a href={outlookWeb} target="_blank" rel="noreferrer"><ExternalLink /> Outlook web</a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={mailto}><Mail /> Desktop mail</a>
              </Button>
            </div>
            <Button type="button" onClick={send} disabled={!draft || sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />} Send now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
