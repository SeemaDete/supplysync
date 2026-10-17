import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";
import { fmtDate, effectiveDate, today } from "@/lib/dates";
import { fmtQty } from "@/lib/utils";
import { audit } from "@/services/audit-service";

let transporter: Transporter | null = null;

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

function getTransporter() {
  if (!emailConfigured()) throw new Error("Email is not configured (SMTP_HOST / SMTP_USER / SMTP_PASSWORD missing)");
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
  }
  return transporter;
}

export type MailInput = { to: string; cc?: string | null; subject: string; text: string; replyTo?: string };

/** Low-level send. Throws on any failure so callers never record a false "sent". */
export async function sendMail(m: MailInput): Promise<{ messageId: string }> {
  const info = await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: m.to,
    cc: m.cc || undefined,
    replyTo: m.replyTo,
    subject: m.subject,
    text: m.text,
  });
  if (!info.accepted?.length || info.rejected?.length) {
    throw new Error(`Rejected recipients: ${(info.rejected || []).join(", ") || "all"}`);
  }
  return { messageId: info.messageId };
}

// ─────────────────────────── Template ───────────────────────────

export type EmailDraft = { to: string; cc: string; subject: string; body: string };

type LineForEmail = {
  lineNumber: number;
  materialNumber: string;
  materialDescription: string;
  orderedQty: unknown;
  receivedQty: unknown;
  outstandingQty: unknown;
  uom: string;
  originalRequestedDate: Date;
  supplierConfirmedDate: Date | null;
  latestRevisedDate: Date | null;
};

export function buildFollowupEmail(po: { poNumber: string; supplier: { email: string }; buyer: { name: string; email: string } }, lines: LineForEmail[]): EmailDraft {
  const blocks = lines.map(
    (l) =>
      `PO: ${po.poNumber} / Line ${l.lineNumber}\n` +
      `Material: ${l.materialNumber} – ${l.materialDescription}\n` +
      `Ordered Qty: ${fmtQty(l.orderedQty)} ${l.uom}\n` +
      `Received Qty: ${fmtQty(l.receivedQty)} ${l.uom}\n` +
      `Pending Qty: ${fmtQty(l.outstandingQty)} ${l.uom}\n` +
      `Expected Delivery Date: ${fmtDate(effectiveDate(l))}`,
  );
  const body =
    `Dear Team,\n\nGreetings.\n\nPlease confirm status of following PO.\n\n` +
    blocks.join("\n\n") +
    `\n\nKindly confirm delivery schedule.\n\nRegards,\n${po.buyer.name}\n${po.buyer.email}`;
  return {
    to: po.supplier.email,
    cc: po.buyer.email,
    subject: `Delivery Confirmation Follow-up – PO ${po.poNumber}`,
    body,
  };
}

export async function draftForPo(poId: string, lineId?: string | null): Promise<EmailDraft> {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: {
      supplier: { select: { email: true } },
      buyer: { select: { name: true, email: true } },
      lines: { where: lineId ? { id: lineId } : { outstandingQty: { gt: 0 } }, orderBy: { lineNumber: "asc" } },
    },
  });
  return buildFollowupEmail(po, po.lines);
}

/** Outlook web deep link + mailto fallback */
export function outlookLinks(d: EmailDraft) {
  const q = (s: string) => encodeURIComponent(s);
  return {
    outlookWeb: `https://outlook.office.com/mail/deeplink/compose?to=${q(d.to)}&cc=${q(d.cc)}&subject=${q(d.subject)}&body=${q(d.body)}`,
    mailto: `mailto:${d.to}?cc=${q(d.cc)}&subject=${q(d.subject)}&body=${q(d.body)}`,
  };
}

/**
 * Send a PO email and store it in the communication history.
 * Record is created as DRAFT first; it becomes SENT only after the SMTP server accepts it.
 * On failure it is stored as FAILED with the error, and the follow-up stays open.
 */
export async function sendPoEmail(input: {
  poId: string;
  lineId?: string | null;
  followupId?: string | null;
  to: string;
  cc?: string | null;
  subject: string;
  body: string;
  userId: string;
  userEmail: string;
}) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: input.poId }, select: { poNumber: true } });
  const comm = await prisma.communication.create({
    data: {
      purchaseOrderId: input.poId,
      lineId: input.lineId ?? null,
      userId: input.userId,
      channel: "EMAIL",
      message: input.body,
      emailTo: input.to,
      emailCc: input.cc ?? null,
      emailSubject: input.subject,
      emailStatus: "DRAFT",
    },
  });

  try {
    const { messageId } = await sendMail({ to: input.to, cc: input.cc, subject: input.subject, text: input.body, replyTo: input.userEmail });
    await prisma.$transaction(async (tx) => {
      await tx.communication.update({ where: { id: comm.id }, data: { emailStatus: "SENT", sentAt: new Date(), emailMessageId: messageId } });
      if (input.followupId) {
        await tx.followup.update({
          where: { id: input.followupId },
          data: { status: "DONE", completedAt: new Date(), completedById: input.userId, outcome: "Follow-up email sent" },
        });
      }
      if (input.lineId) {
        await tx.purchaseOrderLine.update({ where: { id: input.lineId }, data: { lastFollowupDate: today() } });
      } else {
        await tx.purchaseOrderLine.updateMany({ where: { purchaseOrderId: input.poId, outstandingQty: { gt: 0 } }, data: { lastFollowupDate: today() } });
      }
      await audit(tx, { entityType: "Communication", entityId: comm.id, poNumber: po.poNumber, action: "CREATE", field: "email", after: `SENT to ${input.to}`, userId: input.userId });
    });
    return { ok: true as const, id: comm.id, status: "SENT" as const };
  } catch (e) {
    const message = (e as Error).message || "Unknown email error";
    await prisma.communication.update({ where: { id: comm.id }, data: { emailStatus: "FAILED", emailError: message.slice(0, 500) } });
    await audit(prisma, { entityType: "Communication", entityId: comm.id, poNumber: po.poNumber, action: "CREATE", field: "email", after: `FAILED: ${message}`, userId: input.userId });
    return { ok: false as const, id: comm.id, status: "FAILED" as const, error: message };
  }
}
