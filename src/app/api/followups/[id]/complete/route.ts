import { withApi, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { followupCompleteInput } from "@/lib/validation";
import { toDateOnly } from "@/lib/dates";
import { completeFollowup } from "@/services/followup-service";

export const POST = withApi<{ id: string }>(async (req, { params }) => {
  const user = await requireApiUser("followup:manage");
  const { id } = await params;
  const i = followupCompleteInput.parse(await readJson(req));
  return completeFollowup(id, user.id, i.outcome, toDateOnly(i.nextFollowupDate));
});
