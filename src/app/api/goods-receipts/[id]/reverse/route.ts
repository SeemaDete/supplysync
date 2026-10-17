import { withApi, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { archiveInput } from "@/lib/validation";
import { reverseGoodsReceipt } from "@/services/delivery-service";

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireApiUser("gr:post");
  const { id } = await params;
  const { reason } = archiveInput.parse(await readJson(req));
  return reverseGoodsReceipt(user, id, reason);
});
