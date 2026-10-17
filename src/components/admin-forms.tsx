"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/primitives";
import { api } from "@/lib/client-api";

// ───────── Users ─────────
type UserRow = { id?: string; email: string; name: string; role: string; supplierId: string | null; canOverride: boolean; active: boolean };

export function UserDialog({ user, suppliers }: { user?: UserRow; suppliers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<UserRow & { password: string }>({ email: "", name: "", role: "BUYER", supplierId: null, canOverride: false, active: true, ...user, password: "" });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { ...f, supplierId: f.role === "SUPPLIER" ? f.supplierId : null, password: f.password || undefined };
    try {
      if (user?.id) await api(`/api/admin/users/${user.id}`, { method: "PATCH", body });
      else await api("/api/admin/users", { body });
      toast.success("User saved");
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
      {user ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Pencil /> Edit</Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}><Plus /> New user</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={save} className="grid gap-3">
            <DialogHeader><DialogTitle>{user ? "Edit user" : "New user"}</DialogTitle></DialogHeader>
            <Field label="Name *"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Email *" hint="Must match the Microsoft account email for Entra sign-in">
              <Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role">
                <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                  {["ADMIN", "BUYER", "SUPPLIER", "LOGISTICS", "MANAGEMENT"].map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={f.active ? "1" : "0"} onChange={(e) => setF({ ...f, active: e.target.value === "1" })}>
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </Select>
              </Field>
            </div>
            {f.role === "SUPPLIER" && (
              <Field label="Supplier *">
                <Select required value={f.supplierId ?? ""} onChange={(e) => setF({ ...f, supplierId: e.target.value })}>
                  <option value="">Select…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
            )}
            {(f.role === "BUYER" || f.role === "LOGISTICS") && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.canOverride} onChange={(e) => setF({ ...f, canOverride: e.target.checked })} /> Authorised for manual overrides
              </label>
            )}
            <Field label={user ? "New password (leave blank to keep)" : "Password"} hint="Min 8 characters. Leave empty for Microsoft-only sign-in.">
              <Input type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────── Suppliers ─────────
type SupplierRow = { id?: string; code: string; name: string; email: string; contactPerson: string | null; phone: string | null; country: string | null; active: boolean };

export function SupplierDialog({ supplier }: { supplier?: SupplierRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<SupplierRow>({ code: "", name: "", email: "", contactPerson: "", phone: "", country: "India", active: true, ...supplier });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { id: _id, ...body } = f;
    try {
      if (supplier?.id) await api(`/api/admin/suppliers/${supplier.id}`, { method: "PATCH", body });
      else await api("/api/admin/suppliers", { body });
      toast.success("Supplier saved");
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
      {supplier ? (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Pencil /> Edit</Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}><Plus /> New supplier</Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={save} className="grid gap-3">
            <DialogHeader><DialogTitle>{supplier ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Code *"><Input required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
              <Field label="Country"><Input value={f.country ?? ""} onChange={(e) => setF({ ...f, country: e.target.value })} /></Field>
            </div>
            <Field label="Name *"><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
            <Field label="Order email *"><Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact person"><Input value={f.contactPerson ?? ""} onChange={(e) => setF({ ...f, contactPerson: e.target.value })} /></Field>
              <Field label="Phone"><Input value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────── Settings ─────────
type Settings = { followupLeadDays: number; grPendingAfterDays: number; riskOverdueThreshold: number; emailBuyerOnFollowup: boolean; companyName: string };

export function SettingsForm({ initial }: { initial: Settings }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/settings", { method: "PUT", body: f });
      toast.success("Settings saved – run the follow-up engine to apply new lead days");
      router.refresh();
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="grid max-w-xl gap-3">
      <Field label="Company name"><Input value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} /></Field>
      <Field label="Follow-up lead time (days before supplier date)"><Input type="number" min={0} max={60} value={f.followupLeadDays} onChange={(e) => setF({ ...f, followupLeadDays: Number(e.target.value) })} /></Field>
      <Field label="Mark GR pending after (days since delivery)"><Input type="number" min={0} max={30} value={f.grPendingAfterDays} onChange={(e) => setF({ ...f, grPendingAfterDays: Number(e.target.value) })} /></Field>
      <Field label="Supplier at risk when overdue lines ≥"><Input type="number" min={1} max={50} value={f.riskOverdueThreshold} onChange={(e) => setF({ ...f, riskOverdueThreshold: Number(e.target.value) })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.emailBuyerOnFollowup} onChange={(e) => setF({ ...f, emailBuyerOnFollowup: e.target.checked })} /> Email buyers when a follow-up falls due</label>
      <div><Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Save settings</Button></div>
    </form>
  );
}
