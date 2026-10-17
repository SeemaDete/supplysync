import { NextResponse } from "next/server";
import { withApi } from "@/lib/api";
import { requireApiUser } from "@/lib/session";
import { readAttachment } from "@/services/attachment-service";

export const GET = withApi<{ id: string }>(async (_req, { params }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const { att, body } = await readAttachment(user, id);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Disposition": `attachment; filename="${att.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
