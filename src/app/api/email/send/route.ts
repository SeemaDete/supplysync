import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { emailSendInput } from "@/lib/validation";
import { assertPoAccess } from "@/services/po-service";
import { sendPoEmail } from "@/services/email-service";

// POST /api/email/send – returns 200 only when the SMTP server accepted the message.
// On failure returns 502 and the communication is stored with status FAILED.
export const POST = withApi(async (req) => {
  const user = await requireApiUser("email:send");
  const i = emailSendInput.parse(await readJson(req));
  await assertPoAccess(user, i.poId);
  const res = await sendPoEmail({ ...i, userId: user.id, userEmail: user.email });
  if (!res.ok) return NextResponse.json({ error: `Email NOT sent: ${res.error}`, id: res.id, status: res.status }, { status: 502 });
  return res;
});
