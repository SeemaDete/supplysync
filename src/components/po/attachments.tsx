"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/primitives";
import { api } from "@/lib/client-api";
import { fmtDateTime } from "@/lib/dates";
import type { PoDetailDTO } from "@/types";

type Att = PoDetailDTO["attachments"][number];

const KIND_LABEL: Record<string, string> = {
  DELIVERY_NOTE: "Delivery note", ASN: "ASN", INVOICE: "Invoice", GR_DOCUMENT: "GR document", PO_DOCUMENT: "PO document", OTHER: "Other",
};

export function Attachments({ poId, items, lines, canUpload, kinds }: { poId: string; items: Att[]; lines: { id: string; lineNumber: number }[]; canUpload: boolean; kinds: string[] }) {
  const router = useRouter();
  const [kind, setKind] = useState(kinds[0] ?? "OTHER");
  const [lineId, setLineId] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (file.size > 4 * 1024 * 1024) return toast.error("Max 4 MB per file");
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    if (lineId) form.set("lineId", lineId);
    try {
      await api(`/api/purchase-orders/${poId}/attachment`, { form });
      toast.success(`${KIND_LABEL[kind]} uploaded`);
      router.refresh();
    } catch {
      /* toast shown */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {canUpload && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
          <Select value={kind} onChange={(e) => setKind(e.target.value)} className="w-40">
            {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
          <Select value={lineId} onChange={(e) => setLineId(e.target.value)} className="w-32">
            <option value="">Whole PO</option>
            {lines.map((l) => <option key={l.id} value={l.id}>Line {l.lineNumber}</option>)}
          </Select>
          <Button asChild variant="outline" size="sm" disabled={busy}>
            <label className="cursor-pointer">
              {busy ? <Loader2 className="animate-spin" /> : <Upload />} Upload file
              <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.doc,.docx,.xml,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            </label>
          </Button>
          <span className="text-xs text-muted-foreground">PDF, images, Office, CSV, XML · max 4 MB</span>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <a href={`/api/attachments/${a.id}`} className="flex min-w-0 items-center gap-2 text-sm text-primary hover:underline">
                <FileText className="h-4 w-4 shrink-0" /> <span className="truncate">{a.fileName}</span>
              </a>
              <span className="shrink-0 text-right text-xs text-muted-foreground">
                {KIND_LABEL[a.kind]}{a.lineId ? ` · line ${lines.find((l) => l.id === a.lineId)?.lineNumber ?? ""}` : ""} · {(a.sizeBytes / 1024).toFixed(0)} KB
                <br />
                {a.uploadedBy?.name} · {fmtDateTime(a.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
