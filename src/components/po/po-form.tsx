"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/client-api";

type Line = {
  lineNumber: number; materialNumber: string; materialDescription: string; plant: string; storageLocation: string;
  uom: string; unitPrice: string; orderedQty: string; originalRequestedDate: string;
};

const blankLine = (n: number, plant = "1100"): Line => ({
  lineNumber: n, materialNumber: "", materialDescription: "", plant, storageLocation: "", uom: "EA", unitPrice: "", orderedQty: "", originalRequestedDate: "",
});

export function PoForm({ suppliers, buyers, currentUserId, today }: { suppliers: { id: string; name: string; code: string }[]; buyers: { id: string; name: string }[]; currentUserId: string; today: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [header, setHeader] = useState({ poNumber: "", supplierId: "", buyerId: currentUserId, currency: "INR", poCreationDate: today, poSentDate: "", remarks: "" });
  const [lines, setLines] = useState<Line[]>([blankLine(10)]);

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api<{ id: string; poNumber: string }>("/api/purchase-orders", {
        body: {
          ...header,
          poSentDate: header.poSentDate || null,
          lines: lines.map((l) => ({ ...l, storageLocation: l.storageLocation || null, unitPrice: Number(l.unitPrice || 0), orderedQty: Number(l.orderedQty) })),
        },
      });
      toast.success(`PO ${res.poNumber} created`);
      router.push(`/purchase-orders/${res.id}`);
    } catch {
      /* toast already shown */
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Header</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="PO number *">
            <Input required value={header.poNumber} onChange={(e) => setHeader({ ...header, poNumber: e.target.value })} placeholder="4500012345" />
          </Field>
          <Field label="Supplier *">
            <Select required value={header.supplierId} onChange={(e) => setHeader({ ...header, supplierId: e.target.value })}>
              <option value="">Select…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.code} – {s.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Buyer">
            <Select value={header.buyerId} onChange={(e) => setHeader({ ...header, buyerId: e.target.value })}>
              {buyers.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Currency">
            <Select value={header.currency} onChange={(e) => setHeader({ ...header, currency: e.target.value })}>
              {["INR", "USD", "EUR", "GBP", "JPY", "CNY"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="PO creation date *">
            <Input type="date" required value={header.poCreationDate} onChange={(e) => setHeader({ ...header, poCreationDate: e.target.value })} />
          </Field>
          <Field label="PO sent date" hint="Leave empty to save as draft; release later.">
            <Input type="date" value={header.poSentDate} onChange={(e) => setHeader({ ...header, poSentDate: e.target.value })} />
          </Field>
          <Field label="Remarks" className="sm:col-span-2">
            <Textarea rows={1} value={header.remarks} onChange={(e) => setHeader({ ...header, remarks: e.target.value })} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Lines</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine((ls.at(-1)?.lineNumber ?? 0) + 10, ls.at(-1)?.plant)])}>
            <Plus /> Add line
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-6 lg:grid-cols-12">
              <Field label="Line" className="lg:col-span-1">
                <Input type="number" min={1} required value={l.lineNumber} onChange={(e) => setLine(i, { lineNumber: Number(e.target.value) })} />
              </Field>
              <Field label="Material *" className="sm:col-span-2 lg:col-span-2">
                <Input required value={l.materialNumber} onChange={(e) => setLine(i, { materialNumber: e.target.value })} />
              </Field>
              <Field label="Description *" className="sm:col-span-3 lg:col-span-3">
                <Input required value={l.materialDescription} onChange={(e) => setLine(i, { materialDescription: e.target.value })} />
              </Field>
              <Field label="Plant *">
                <Input required value={l.plant} onChange={(e) => setLine(i, { plant: e.target.value })} />
              </Field>
              <Field label="SLoc">
                <Input value={l.storageLocation} onChange={(e) => setLine(i, { storageLocation: e.target.value })} />
              </Field>
              <Field label="Qty *">
                <Input type="number" step="any" min="0" required value={l.orderedQty} onChange={(e) => setLine(i, { orderedQty: e.target.value })} />
              </Field>
              <Field label="UOM">
                <Input value={l.uom} onChange={(e) => setLine(i, { uom: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Unit price">
                <Input type="number" step="any" min="0" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
              </Field>
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-12 lg:justify-end">
                <Field label="Requested delivery date *" className="flex-1 lg:max-w-[220px]">
                  <Input type="date" required value={l.originalRequestedDate} onChange={(e) => setLine(i, { originalRequestedDate: e.target.value })} />
                </Field>
                {lines.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Create PO</Button>
      </div>
    </form>
  );
}
