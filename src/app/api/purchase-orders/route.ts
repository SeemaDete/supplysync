import { withApi, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { poCreateInput } from "@/lib/validation";
import { createPo, listLines, type PoListFilters } from "@/services/po-service";

// GET /api/purchase-orders?q=&status=&supplierId=&buyerId=&plant=&archived=&overdue=1&page=1
export const GET = withApi(async (req) => {
  const user = await requireApiUser();
  const sp = new URL(req.url).searchParams;
  const filters: PoListFilters = {
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    supplierId: sp.get("supplierId") ?? undefined,
    buyerId: sp.get("buyerId") ?? undefined,
    plant: sp.get("plant") ?? undefined,
    archived: (sp.get("archived") as PoListFilters["archived"]) ?? undefined,
    overdue: sp.get("overdue") === "1",
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  };
  const page = Math.max(1, Number(sp.get("page") || 1));
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") || 50)));
  return listLines(user, filters, page, pageSize);
});

// POST /api/purchase-orders  { poNumber, supplierId, poCreationDate, lines: [...] }
export const POST = withApi(async (req) => {
  const user = await requireApiUser("po:create");
  const input = poCreateInput.parse(await readJson(req));
  const po = await createPo(user, input);
  return { id: po.id, poNumber: po.poNumber };
});
