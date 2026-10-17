import { NextResponse } from "next/server";
import { withApi, readJson } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/session";
import { archiveInput, commentInput } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { archivePo, assertPoAccess, closePo, sendPoToSupplier } from "@/services/po-service";
import { acknowledgePo } from "@/services/response-service";
import { draftForPo, outlookLinks } from "@/services/email-service";
import { saveAttachment } from "@/services/attachment-service";
import { notify, notifySupplierUsers } from "@/services/notification-service";
import type { AttachmentKind } from "@prisma/client";

type P = { id: string; action: string };

const KINDS: AttachmentKind[] = ["DELIVERY_NOTE", "ASN", "INVOICE", "GR_DOCUMENT", "PO_DOCUMENT", "OTHER"];

// GET /api/purchase-orders/:id/email-draft?lineId=
export const GET = withApi<P>(async (req, { params }) => {
  const { id, action } = await params;
  if (action !== "email-draft") throw new HttpError(404, "Unknown action");
  const user = await requireApiUser("email:send");
  await assertPoAccess(user, id);
  const draft = await draftForPo(id, new URL(req.url).searchParams.get("lineId"));
  return { ...draft, ...outlookLinks(draft) };
});

// POST /api/purchase-orders/:id/{archive|restore|send|close|acknowledge|comment|attachment}
export const POST = withApi<P>(async (req, { params }) => {
  const { id, action } = await params;

  switch (action) {
    case "archive":
    case "restore": {
      const user = await requireApiUser("po:archive");
      const { reason } = archiveInput.parse(await readJson(req));
      return archivePo(user, id, reason, action === "restore");
    }
    case "send": {
      const user = await requireApiUser("po:edit");
      return sendPoToSupplier(user, id);
    }
    case "close": {
      const user = await requireApiUser("po:close");
      const { reason } = archiveInput.parse(await readJson(req));
      return closePo(user, id, reason);
    }
    case "acknowledge": {
      const user = await requireApiUser();
      if (user.role !== "SUPPLIER" && user.role !== "BUYER" && user.role !== "ADMIN") throw new HttpError(403, "Not allowed");
      const body = await readJson<{ remarks?: string }>(req).catch(() => ({} as { remarks?: string }));
      return acknowledgePo(user, id, body.remarks ?? null);
    }
    case "comment": {
      // multipart/form-data: message, lineId?, internal?, file?
      const user = await requireApiUser("comment:create");
      const po = await assertPoAccess(user, id);
      const form = await req.formData();
      const input = commentInput.parse({
        message: String(form.get("message") ?? ""),
        lineId: (form.get("lineId") as string) || null,
        internal: user.role !== "SUPPLIER" && form.get("internal") === "true",
      });
      const comm = await prisma.communication.create({
        data: { purchaseOrderId: id, lineId: input.lineId, userId: user.id, channel: "COMMENT", internal: input.internal, message: input.message },
      });
      const file = form.get("file");
      if (file && typeof file !== "string" && file.size > 0) {
        await saveAttachment(user, file, { poId: id, lineId: input.lineId, communicationId: comm.id, kind: "OTHER" });
      }
      // Let the other side know
      if (user.role === "SUPPLIER") {
        await notify(po.buyerId, { title: `Supplier message on PO ${po.poNumber}`, body: input.message.slice(0, 140), link: `/purchase-orders/${id}?tab=communication` });
      } else if (!input.internal) {
        await notifySupplierUsers(po.supplierId, { title: `New message on PO ${po.poNumber}`, body: input.message.slice(0, 140), link: `/portal/po/${id}` });
      }
      return { id: comm.id };
    }
    case "attachment": {
      const user = await requireApiUser("attachment:upload");
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new HttpError(422, "Choose a file");
      const kind = String(form.get("kind") || "OTHER") as AttachmentKind;
      if (!KINDS.includes(kind)) throw new HttpError(422, "Unknown document type");
      if (user.role === "SUPPLIER" && !["DELIVERY_NOTE", "ASN", "INVOICE", "OTHER"].includes(kind)) throw new HttpError(403, "Suppliers can upload delivery notes, ASNs and invoices");
      const att = await saveAttachment(user, file, { poId: id, lineId: (form.get("lineId") as string) || null, kind });
      const po = await assertPoAccess(user, id);
      await prisma.communication.create({
        data: { purchaseOrderId: id, userId: user.id, channel: "SYSTEM", message: `${kind.replace(/_/g, " ").toLowerCase()} uploaded: ${att.fileName}` },
      });
      if (user.role === "SUPPLIER") await notify(po.buyerId, { title: `Document uploaded – PO ${po.poNumber}`, body: `${kind.replace(/_/g, " ")}: ${att.fileName}`, link: `/purchase-orders/${id}?tab=documents` });
      return att;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  }
});
