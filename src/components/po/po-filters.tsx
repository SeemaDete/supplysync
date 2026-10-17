"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

const STATUSES = ["OPEN", "PARTIALLY_DELIVERED", "DELIVERED", "GR_PENDING", "PARTIALLY_RECEIVED", "FULLY_RECEIVED", "OVERDUE", "DISCREPANCY", "CLOSED"];

export function PoFilters({ suppliers, buyers, plants, showArchived = true }: { suppliers: { id: string; name: string }[]; buyers: { id: string; name: string }[]; plants: string[]; showArchived?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [pending, start] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`));
  }

  // debounce free-text search
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set("q", q);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const active = ["status", "supplierId", "buyerId", "plant", "archived", "overdue", "q"].some((k) => sp.get(k));

  return (
    <div className={`grid gap-2 sm:grid-cols-2 lg:grid-cols-7 ${pending ? "opacity-70" : ""}`}>
      <div className="relative lg:col-span-2">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="PO, material, supplier…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
      </div>
      <Select value={sp.get("status") ?? ""} onChange={(e) => set("status", e.target.value)} aria-label="Status">
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
          </option>
        ))}
      </Select>
      <Select value={sp.get("supplierId") ?? ""} onChange={(e) => set("supplierId", e.target.value)} aria-label="Supplier">
        <option value="">All suppliers</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </Select>
      <Select value={sp.get("buyerId") ?? ""} onChange={(e) => set("buyerId", e.target.value)} aria-label="Buyer">
        <option value="">All buyers</option>
        {buyers.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </Select>
      <Select value={sp.get("plant") ?? ""} onChange={(e) => set("plant", e.target.value)} aria-label="Plant">
        <option value="">All plants</option>
        {plants.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </Select>
      <div className="flex gap-2">
        {showArchived && (
          <Select value={sp.get("archived") ?? ""} onChange={(e) => set("archived", e.target.value)} aria-label="Archived">
            <option value="">Active</option>
            <option value="include">Active + archived</option>
            <option value="only">Archived only</option>
          </Select>
        )}
        {active && (
          <Button variant="ghost" size="icon" aria-label="Clear filters" onClick={() => { setQ(""); start(() => router.push(pathname)); }}>
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}
