import type { AttachmentKind } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { HttpError, type SessionUser } from "@/lib/session";
import { audit } from "@/services/audit-service";
import { assertPoAccess } from "@/services/po-service";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel serverless request body limit is ~4.5 MB
const ALLOWED = [
  "application/pdf", "image/png", "image/jpeg", "image/webp", "text/csv", "text/plain",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/xml", "text/xml",
];

function storage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } }).storage.from(process.env.SUPABASE_STORAGE_BUCKET || "attachments");
}

export async function saveAttachment(
  user: SessionUser,
  file: File,
  meta: { poId: string; lineId?: string | null; communicationId?: string | null; kind: AttachmentKind },
) {
  const po = await assertPoAccess(user, meta.poId);
  if (file.size === 0) throw new HttpError(422, "File is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "File too large (max 4 MB)");
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.includes(mime)) throw new HttpError(415, `File type ${mime} is not allowed`);
  if (meta.lineId) {
    const ok = await prisma.purchaseOrderLine.count({ where: { id: meta.lineId, purchaseOrderId: meta.poId } });
    if (!ok) throw new HttpError(404, "Line does not belong to this PO");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const bucket = storage();
  let storagePath: string | null = null;
  if (bucket) {
    storagePath = `${po.poNumber}/${Date.now()}_${safeName}`;
    const { error } = await bucket.upload(storagePath, bytes, { contentType: mime, upsert: false });
    if (error) throw new HttpError(502, `Upload failed: ${error.message}`);
  }

  const att = await prisma.attachment.create({
    data: {
      purchaseOrderId: meta.poId,
      lineId: meta.lineId ?? null,
      communicationId: meta.communicationId ?? null,
      kind: meta.kind,
      fileName: safeName,
      mimeType: mime,
      sizeBytes: file.size,
      storagePath,
      data: bucket ? null : bytes,
      uploadedById: user.id,
    },
    select: { id: true, fileName: true, kind: true, sizeBytes: true },
  });
  await audit(prisma, { entityType: "Attachment", entityId: att.id, poNumber: po.poNumber, action: "CREATE", field: meta.kind, after: safeName, userId: user.id });
  return att;
}

export async function readAttachment(user: SessionUser, id: string) {
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att || !att.purchaseOrderId) throw new HttpError(404, "Attachment not found");
  await assertPoAccess(user, att.purchaseOrderId);
  if (att.storagePath) {
    const bucket = storage();
    if (!bucket) throw new HttpError(500, "Storage not configured");
    const { data, error } = await bucket.download(att.storagePath);
    if (error || !data) throw new HttpError(502, "Could not download file");
    return { att, body: Buffer.from(await data.arrayBuffer()) };
  }
  return { att, body: Buffer.from(att.data ?? new Uint8Array()) };
}
