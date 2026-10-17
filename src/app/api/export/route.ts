import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { todayISO } from "@/lib/dates";
import type { PoListFilters } from "@/services/po-service";
import { exportData } from "@/services/import-export-service";

// GET /api/export?format=xlsx|csv&<same filters as the PO tracker>
export const GET = withApi(async (req) => {
  const user = await requireApiUser();
  if (user.role !== "SUPPLIER") await requireApiUser("export:run");
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") === "csv" ? "csv" : "xlsx";
  const filters: PoListFilters = {
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    supplierId: sp.get("supplierId") ?? undefined,
    buyerId: sp.get("buyerId") ?? undefined,
    plant: sp.get("plant") ?? undefined,
    archived: (sp.get("archived") as PoListFilters["archived"]) ?? undefined,
    overdue: sp.get("overdue") === "1",
  };
  const buf = await exportData(user, filters, format);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="SupplySync_PO_Tracker_${todayISO()}.${format}"`,
    },
  });
});
