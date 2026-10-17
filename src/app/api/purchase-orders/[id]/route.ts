import { withApi, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { poUpdateInput } from "@/lib/validation";
import { getPoDetail, updatePo } from "@/services/po-service";

type P = { id: string };

export const GET = withApi<P>(async (_req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  return getPoDetail(user, id);
});

export const PATCH = withApi<P>(async (req, { params }) => {
  const user = await requireApiUser("po:edit");
  const { id } = await params;
  const input = poUpdateInput.parse(await readJson(req));
  return updatePo(user, id, input);
});
