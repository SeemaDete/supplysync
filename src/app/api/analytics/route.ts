import { withApi } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { loadAnalytics } from "@/services/analytics-service";

// GET /api/analytics?mine=1 – KPI + chart data as JSON (usable by Power BI "Web" connector with a session, or by the UI)
export const GET = withApi(async (req) => {
  const user = await requireApiUser("dashboard:view");
  const mine = new URL(req.url).searchParams.get("mine") === "1" && user.role === "BUYER";
  return loadAnalytics(mine ? { buyerId: user.id } : {});
});
