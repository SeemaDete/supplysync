import { z } from "zod";

// Shared zod schemas used by API routes and client forms.

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-mm-dd");
const optDate = z.union([dateStr, z.literal(""), z.null()]).optional().transform((v) => (v ? v : null));
const qty = z.coerce.number().finite().nonnegative("Must be ≥ 0");
const posQty = z.coerce.number().finite().positive("Must be > 0");
const text = (max = 500) => z.string().trim().max(max);
const optText = (max = 2000) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const poLineInput = z.object({
  id: z.string().optional(),
  lineNumber: z.coerce.number().int().positive(),
  materialNumber: text(40).min(1, "Required"),
  materialDescription: text(200).min(1, "Required"),
  plant: text(10).min(1, "Required"),
  storageLocation: optText(10),
  uom: text(10).min(1).default("EA"),
  unitPrice: qty.default(0),
  orderedQty: posQty,
  originalRequestedDate: dateStr,
  remarks: optText(),
});

export const poCreateInput = z.object({
  poNumber: text(20).min(3, "PO number required").regex(/^[A-Za-z0-9\-/]+$/, "Letters, digits, - and / only"),
  supplierId: z.string().min(1, "Select a supplier"),
  buyerId: z.string().min(1).optional(),
  currency: text(3).default("INR"),
  poCreationDate: dateStr,
  poSentDate: optDate,
  remarks: optText(),
  lines: z.array(poLineInput).min(1, "Add at least one line"),
});

export const poUpdateInput = z.object({
  supplierId: z.string().optional(),
  buyerId: z.string().optional(),
  poSentDate: optDate,
  remarks: optText(),
  lines: z.array(poLineInput).optional(),
});

export const archiveInput = z.object({ reason: text(500).min(3, "Give a reason") });

export const commentInput = z.object({
  message: text(4000).min(1, "Message is empty"),
  lineId: z.string().optional().nullable(),
  internal: z.boolean().optional().default(false),
});

export const supplierAckInput = z.object({ remarks: optText() });

export const supplierConfirmInput = z.object({
  lineId: z.string(),
  confirmedDate: dateStr,
  remarks: optText(),
});

export const supplierReviseInput = z.object({
  lineId: z.string(),
  revisedDate: dateStr,
  delayReason: text(300).min(3, "Delay reason required"),
  remarks: optText(),
});

export const dispatchInput = z.object({
  lineId: z.string(),
  dispatchedQty: qty,
  remarks: optText(),
});

export const responseInput = z.object({
  lineId: z.string(),
  responseReceived: z.boolean().default(true),
  responseDate: dateStr,
  deliveryConfirmed: z.boolean().default(false),
  confirmedDate: optDate,
  revisedDate: optDate,
  delayReason: optText(300),
  supplierComments: optText(),
  nextAction: optText(300),
  nextFollowupDate: optDate,
});

export const deliveryInput = z.object({
  lineId: z.string(),
  deliveryNote: text(40).min(1, "Delivery note required"),
  asnNumber: optText(40),
  deliveryDate: dateStr,
  quantity: posQty,
  remarks: optText(),
});

export const grInput = z.object({
  lineId: z.string(),
  deliveryRecordId: z.string().optional().nullable(),
  grNumber: text(20).min(1, "GR number required"),
  grDate: dateStr,
  quantity: posQty,
  remarks: optText(),
});

export const overrideInput = z.object({
  lineId: z.string(),
  field: z.enum(["latestRevisedDate", "commitmentDate", "remarks", "status", "actualDeliveryDate"]),
  value: z.string().max(2000).nullable(),
  reason: text(500).min(5, "Explain why (min 5 characters)"),
});

export const emailSendInput = z.object({
  poId: z.string(),
  lineId: z.string().optional().nullable(),
  followupId: z.string().optional().nullable(),
  to: z.string().min(3),
  cc: z.string().optional().nullable(),
  subject: text(250).min(1),
  body: z.string().min(1).max(20000),
});

export const followupCompleteInput = z.object({
  outcome: optText(500),
  nextFollowupDate: optDate,
});

export const userInput = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  name: text(100).min(1),
  role: z.enum(["ADMIN", "BUYER", "SUPPLIER", "LOGISTICS", "MANAGEMENT"]),
  supplierId: z.string().optional().nullable(),
  canOverride: z.boolean().default(false),
  active: z.boolean().default(true),
  password: z.string().min(8, "Min 8 characters").optional().or(z.literal("")),
});

export const supplierInput = z.object({
  code: text(20).min(1),
  name: text(150).min(1),
  email: z.string().email(),
  contactPerson: optText(100),
  phone: optText(30),
  country: optText(50),
  active: z.boolean().default(true),
});

export const settingsInput = z.object({
  followupLeadDays: z.coerce.number().int().min(0).max(60),
  grPendingAfterDays: z.coerce.number().int().min(0).max(30),
  riskOverdueThreshold: z.coerce.number().int().min(1).max(50),
  emailBuyerOnFollowup: z.boolean(),
  companyName: text(100),
});

export type PoCreateInput = z.infer<typeof poCreateInput>;
export type PoLineInput = z.infer<typeof poLineInput>;
