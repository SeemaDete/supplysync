"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Lock, Mail, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Textarea } from "@/components/ui/primitives";
import { StatusBadge } from "@/components/status-badge";
import { api } from "@/lib/client-api";
import { cn, initials } from "@/lib/utils";
import { fmtDateTime } from "@/lib/dates";
import type { PoDetailDTO } from "@/types";

type Comm = PoDetailDTO["communications"][number];

/** Teams-style conversation attached to a PO (Module 3) */
export function CommThread({ poId, items, currentUserName, canComment, canInternal }: { poId: string; items: Comm[]; currentUserName: string; canComment: boolean; canInternal: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    const form = new FormData();
    form.set("message", message);
    form.set("internal", String(internal));
    if (file) form.set("file", file);
    try {
      await api(`/api/purchase-orders/${poId}/comment`, { form });
      setMessage("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="max-h-[520px] space-y-3 overflow-y-auto rounded-md border bg-muted/30 p-3 scrollbar-thin">
        {items.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>}
        {items.map((c) => {
          const mine = c.user?.name === currentUserName;
          if (c.channel === "SYSTEM") {
            return (
              <div key={c.id} className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
                <Bot className="h-3 w-3" /> {c.message} · {fmtDateTime(c.createdAt)}
              </div>
            );
          }
          const isSupplier = c.user?.role.key === "SUPPLIER";
          return (
            <div key={c.id} className={cn("flex gap-2", mine && "flex-row-reverse")}>
              <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold", isSupplier ? "bg-amber-200 text-amber-900" : "bg-primary text-primary-foreground")}>
                {initials(c.user?.name ?? "?")}
              </span>
              <div className={cn("max-w-[85%] rounded-lg border bg-card px-3 py-2 shadow-sm", mine && "bg-accent")}>
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="font-semibold text-foreground">{c.user?.name ?? "System"}</span>
                  {isSupplier && <Badge tone="amber">Supplier</Badge>}
                  {c.internal && <Badge><Lock className="h-3 w-3" /> Internal</Badge>}
                  {c.channel === "EMAIL" && <Badge tone="blue"><Mail className="h-3 w-3" /> Email</Badge>}
                  {c.emailStatus && <StatusBadge status={c.emailStatus} />}
                  <span>{fmtDateTime(c.createdAt)}</span>
                </div>
                {c.channel === "EMAIL" && (
                  <p className="mb-1 text-xs text-muted-foreground">
                    To {c.emailTo}{c.emailCc ? `, cc ${c.emailCc}` : ""} · <span className="font-medium text-foreground">{c.emailSubject}</span>
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm">{c.message}</p>
                {c.emailError && <p className="mt-1 text-xs text-destructive">Delivery failed: {c.emailError}</p>}
                {c.attachments.map((a) => (
                  <a key={a.id} href={`/api/attachments/${a.id}`} className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline">
                    <Paperclip className="h-3 w-3" /> {a.fileName}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {canComment && (
        <form onSubmit={post} className="grid gap-2">
          <Textarea rows={2} placeholder="Write a message… (visible to the supplier unless marked internal)" value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) post(e); }} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Paperclip className="h-3.5 w-3.5" /> {file ? file.name : "Attach"}
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f && f.size > 4 * 1024 * 1024) { toast.error("Max 4 MB"); return; } setFile(f); }} />
              </label>
              {canInternal && (
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note
                </label>
              )}
            </div>
            <Button type="submit" size="sm" disabled={busy || !message.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Send />} Post
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
