import ExcelJS from "exceljs";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { toDateOnly, isoDate, fmtDate, effectiveDate } from "@/lib/dates";
import { HttpError, type SessionUser } from "@/lib/session";
import { num, titleCase } from "@/lib/utils";
import { audit } from "@/services/audit-service";
import { recalcLine } from "@/services/line-status";
import { syncLineFollowup } from "@/services/followup-service";
import { lineWhere, lineListInclude, type PoListFilters } from "@/services/po-service";

// ─────────────────────────── Import field catalogue ───────────────────────────

export type ImportField =
  | "poNumber" | "lineNumber" | "supplierCode" | "supplierName" | "supplierEmail" | "supplierContact"
  | "materialNumber" | "materialDescription" | "plant" | "storageLocation" | "orderedQty" | "uom" | "unitPrice"
  | "currency" | "poCreationDate" | "poSentDate" | "requestedDate" | "confirmedDate" | "buyerEmail" | "remarks";

export const IMPORT_FIELDS: { key: ImportField; label: string; required: boolean; synonyms: string[] }[] = [
  { key: "poNumber", label: "PO Number", required: true, synonyms: ["po", "po no", "purchasing document", "ebeln", "purchase order"] },
  { key: "lineNumber", label: "PO Line", required: true, synonyms: ["line", "item", "po item", "ebelp", "line no"] },
  { key: "supplierCode", label: "Supplier Code", required: true, synonyms: ["vendor", "vendor code", "lifnr", "supplier"] },
  { key: "supplierName", label: "Supplier Name", required: false, synonyms: ["vendor name", "name of vendor"] },
  { key: "supplierEmail", label: "Supplier Email", required: false, synonyms: ["vendor email", "email"] },
  { key: "supplierContact", label: "Supplier Contact Person", required: false, synonyms: ["contact", "contact person"] },
  { key: "materialNumber", label: "Material Number", required: true, synonyms: ["material", "matnr", "material no", "part number"] },
  { key: "materialDescription", label: "Material Description", required: true, synonyms: ["short text", "description", "txz01"] },
  { key: "plant", label: "Plant", required: true, synonyms: ["werks"] },
  { key: "storageLocation", label: "Storage Location", required: false, synonyms: ["sloc", "lgort", "stor loc"] },
  { key: "orderedQty", label: "Ordered Quantity", required: true, synonyms: ["order quantity", "qty", "quantity", "menge", "po quantity"] },
  { key: "uom", label: "UOM", required: false, synonyms: ["unit", "order unit", "meins", "uom"] },
  { key: "unitPrice", label: "Unit Price", required: false, synonyms: ["net price", "price", "netpr"] },
  { key: "currency", label: "Currency", required: false, synonyms: ["curr", "waers"] },
  { key: "poCreationDate", label: "PO Creation Date", required: true, synonyms: ["document date", "po date", "created on", "bedat"] },
  { key: "poSentDate", label: "PO Sent Date", required: false, synonyms: ["sent date", "output date"] },
  { key: "requestedDate", label: "Original Requested Date", required: true, synonyms: ["delivery date", "requested date", "eindt", "need date"] },
  { key: "confirmedDate", label: "Supplier Confirmed Date", required: false, synonyms: ["confirmed date", "confirmation date"] },
  { key: "buyerEmail", label: "Buyer Email", required: false, synonyms: ["buyer", "purchasing group email"] },
  { key: "remarks", label: "Remarks", required: false, synonyms: ["comment", "notes"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function autoMap(headers: string[]): Partial<Record<ImportField, string>> {
  const map: Partial<Record<ImportField, string>> = {};
  for (const f of IMPORT_FIELDS) {
    const candidates = [norm(f.label), norm(f.key.replace(/([A-Z])/g, " $1")), ...f.synonyms.map(norm)];
    const hit = headers.find((h) => candidates.includes(norm(h)));
    if (hit) map[f.key] = hit;
  }
  return map;
}

// ─────────────────────────── Parsing ───────────────────────────

export type ParsedSheet = { headers: string[]; rows: Record<string, unknown>[] };

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isoDate(new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())));
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return "";
  }
  return v;
}

export async function parseFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  if (file.size > 4 * 1024 * 1024) throw new HttpError(413, "File too large (max 4 MB). Split it into smaller files.");
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
    return { headers: res.meta.fields ?? [], rows: res.data };
  }
  if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as never);
    const ws = wb.worksheets[0];
    if (!ws) throw new HttpError(422, "Workbook has no sheets");
    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = String(cellValue(cell.value)).trim();
    });
    const rows: Record<string, unknown>[] = [];
    ws.eachRow({ includeEmpty: false }, (row, idx) => {
      if (idx === 1) return;
      const rec: Record<string, unknown> = {};
      let any = false;
      headers.forEach((h, i) => {
        if (!h) return;
        const v = cellValue(row.getCell(i + 1).value);
        if (v !== "") any = true;
        rec[h] = v;
      });
      if (any) rows.push(rec);
    });
    return { headers: headers.filter(Boolean), rows };
  }
  throw new HttpError(415, "Upload a .csv or .xlsx file (.xls is not supported – save as .xlsx)");
}

// ─────────────────────────── Validation ───────────────────────────

export type NormalizedRow = {
  rowNumber: number;
  poNumber: string; lineNumber: number; supplierCode: string; supplierName: string | null; supplierEmail: string | null; supplierContact: string | null;
  materialNumber: string; materialDescription: string; plant: string; storageLocation: string | null; orderedQty: number; uom: string;
  unitPrice: number; currency: string; poCreationDate: Date; poSentDate: Date | null; requestedDate: Date; confirmedDate: Date | null;
  buyerEmail: string | null; remarks: string | null;
};

export type RowResult = {
  rowNumber: number;
  status: "valid" | "error" | "duplicate";
  errors: string[];
  duplicateOf?: "file" | "database";
  data?: NormalizedRow;
  preview: Record<string, unknown>;
};

export async function validateRows(rows: Record<string, unknown>[], mapping: Partial<Record<ImportField, string>>) {
  for (const f of IMPORT_FIELDS) if (f.required && !mapping[f.key]) throw new HttpError(422, `Map a column to "${f.label}"`);
  const get = (r: Record<string, unknown>, k: ImportField) => {
    const col = mapping[k];
    if (!col) return "";
    const v = r[col];
    return v === null || v === undefined ? "" : typeof v === "string" ? v.trim() : v;
  };

  const suppliers = new Map((await prisma.supplier.findMany({ select: { code: true } })).map((s) => [s.code.toUpperCase(), true]));
  const buyers = new Set((await prisma.user.findMany({ where: { role: { key: { in: ["BUYER", "ADMIN"] } } }, select: { email: true } })).map((u) => u.email));
  const seen = new Set<string>();
  const results: RowResult[] = [];

  // Existing PO lines for duplicate detection
  const poNumbers = [...new Set(rows.map((r) => String(get(r, "poNumber"))).filter(Boolean))];
  const existing = new Set(
    (
      await prisma.purchaseOrderLine.findMany({
        where: { purchaseOrder: { poNumber: { in: poNumbers } } },
        select: { lineNumber: true, purchaseOrder: { select: { poNumber: true } } },
      })
    ).map((l) => `${l.purchaseOrder.poNumber}#${l.lineNumber}`),
  );

  rows.forEach((r, i) => {
    const rowNumber = i + 2; // header is row 1
    const errors: string[] = [];
    const poNumber = String(get(r, "poNumber"));
    const lineNumber = Number(get(r, "lineNumber"));
    const supplierCode = String(get(r, "supplierCode")).toUpperCase();
    const orderedQty = Number(String(get(r, "orderedQty")).replace(/,/g, ""));
    const unitPriceRaw = String(get(r, "unitPrice")).replace(/,/g, "");
    const unitPrice = unitPriceRaw ? Number(unitPriceRaw) : 0;
    const poCreationDate = toDateOnly(get(r, "poCreationDate"));
    const requestedDate = toDateOnly(get(r, "requestedDate"));
    const poSentDate = toDateOnly(get(r, "poSentDate"));
    const confirmedDate = toDateOnly(get(r, "confirmedDate"));
    const supplierEmail = String(get(r, "supplierEmail")) || null;
    const buyerEmail = String(get(r, "buyerEmail")).toLowerCase() || null;

    if (!poNumber) errors.push("PO Number is empty");
    if (!Number.isInteger(lineNumber) || lineNumber <= 0) errors.push("PO Line must be a positive whole number");
    if (!supplierCode) errors.push("Supplier Code is empty");
    if (!String(get(r, "materialNumber"))) errors.push("Material Number is empty");
    if (!String(get(r, "materialDescription"))) errors.push("Material Description is empty");
    if (!String(get(r, "plant"))) errors.push("Plant is empty");
    if (!Number.isFinite(orderedQty) || orderedQty <= 0) errors.push("Ordered Quantity must be > 0");
    if (!Number.isFinite(unitPrice) || unitPrice < 0) errors.push("Unit Price must be ≥ 0");
    if (!poCreationDate) errors.push("PO Creation Date is missing or invalid");
    if (!requestedDate) errors.push("Requested Date is missing or invalid");
    if (get(r, "poSentDate") && !poSentDate) errors.push("PO Sent Date is invalid");
    if (get(r, "confirmedDate") && !confirmedDate) errors.push("Supplier Confirmed Date is invalid");
    if (supplierCode && !suppliers.has(supplierCode) && !supplierEmail) errors.push(`Unknown supplier ${supplierCode} – add Supplier Name + Email to create it`);
    if (supplierEmail && !/^\S+@\S+\.\S+$/.test(supplierEmail)) errors.push("Supplier Email is invalid");
    if (buyerEmail && !buyers.has(buyerEmail)) errors.push(`Buyer ${buyerEmail} is not a SupplySync buyer`);

    const key = `${poNumber}#${lineNumber}`;
    let duplicateOf: RowResult["duplicateOf"];
    if (seen.has(key)) duplicateOf = "file";
    else if (existing.has(key)) duplicateOf = "database";
    seen.add(key);

    const preview = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, get(r, f.key)]));
    if (errors.length) {
      results.push({ rowNumber, status: "error", errors, preview });
      return;
    }
    const data: NormalizedRow = {
      rowNumber, poNumber, lineNumber, supplierCode,
      supplierName: String(get(r, "supplierName")) || null, supplierEmail, supplierContact: String(get(r, "supplierContact")) || null,
      materialNumber: String(get(r, "materialNumber")), materialDescription: String(get(r, "materialDescription")),
      plant: String(get(r, "plant")), storageLocation: String(get(r, "storageLocation")) || null,
      orderedQty, uom: String(get(r, "uom")) || "EA", unitPrice, currency: String(get(r, "currency")) || "INR",
      poCreationDate: poCreationDate!, poSentDate, requestedDate: requestedDate!, confirmedDate, buyerEmail, remarks: String(get(r, "remarks")) || null,
    };
    results.push({ rowNumber, status: duplicateOf ? "duplicate" : "valid", errors: duplicateOf === "file" ? ["Same PO + line appears earlier in this file"] : [], duplicateOf, data, preview });
  });

  const summary = {
    total: results.length,
    valid: results.filter((r) => r.status === "valid").length,
    errors: results.filter((r) => r.status === "error").length,
    duplicatesInFile: results.filter((r) => r.duplicateOf === "file").length,
    duplicatesInDb: results.filter((r) => r.duplicateOf === "database").length,
  };
  return { results, summary };
}

// ─────────────────────────── Commit ───────────────────────────

export async function commitImport(
  user: SessionUser,
  rows: Record<string, unknown>[],
  mapping: Partial<Record<ImportField, string>>,
  duplicateMode: "skip" | "update",
) {
  const { results } = await validateRows(rows, mapping);
  const summary = { created: 0, updated: 0, skipped: 0, failed: 0, suppliersCreated: 0, errors: [] as { row: number; error: string }[] };

  for (const r of results) {
    if (r.status === "error" || !r.data) {
      summary.failed++;
      summary.errors.push({ row: r.rowNumber, error: r.errors.join("; ") });
      continue;
    }
    if (r.duplicateOf === "file" || (r.duplicateOf === "database" && duplicateMode === "skip")) {
      summary.skipped++;
      continue;
    }
    const d = r.data;
    try {
      await prisma.$transaction(async (tx) => {
        let supplier = await tx.supplier.findUnique({ where: { code: d.supplierCode } });
        if (!supplier) {
          supplier = await tx.supplier.create({ data: { code: d.supplierCode, name: d.supplierName ?? d.supplierCode, email: d.supplierEmail!, contactPerson: d.supplierContact } });
          summary.suppliersCreated++;
        }
        const buyer = d.buyerEmail ? await tx.user.findUnique({ where: { email: d.buyerEmail } }) : null;
        let po = await tx.purchaseOrder.findUnique({ where: { poNumber: d.poNumber } });
        if (!po) {
          po = await tx.purchaseOrder.create({
            data: {
              poNumber: d.poNumber, supplierId: supplier.id, buyerId: buyer?.id ?? user.id, currency: d.currency,
              poCreationDate: d.poCreationDate, poSentDate: d.poSentDate, supplierReceiptStatus: d.poSentDate ? "PENDING" : "NOT_SENT",
              status: d.poSentDate ? "SENT" : "DRAFT", remarks: null,
            },
          });
          await audit(tx, { entityType: "PurchaseOrder", entityId: po.id, poNumber: po.poNumber, action: "IMPORT", userId: user.id });
        }
        const lineData = {
          materialNumber: d.materialNumber, materialDescription: d.materialDescription, plant: d.plant, storageLocation: d.storageLocation,
          uom: d.uom, unitPrice: d.unitPrice, orderedQty: d.orderedQty, originalRequestedDate: d.requestedDate, remarks: d.remarks,
          ...(d.confirmedDate ? { supplierConfirmedDate: d.confirmedDate, confirmationStatus: "CONFIRMED" as const, commitmentDate: d.confirmedDate } : {}),
        };
        const existing = await tx.purchaseOrderLine.findUnique({ where: { purchaseOrderId_lineNumber: { purchaseOrderId: po.id, lineNumber: d.lineNumber } } });
        let lineId: string;
        if (existing) {
          if (d.orderedQty < num(existing.receivedQty)) throw new Error("Ordered qty below already received qty");
          await tx.purchaseOrderLine.update({ where: { id: existing.id }, data: lineData });
          await audit(tx, { entityType: "PurchaseOrderLine", entityId: existing.id, poNumber: po.poNumber, action: "IMPORT", field: "update", userId: user.id });
          lineId = existing.id;
          summary.updated++;
        } else {
          const created = await tx.purchaseOrderLine.create({ data: { ...lineData, purchaseOrderId: po.id, lineNumber: d.lineNumber, outstandingQty: d.orderedQty } });
          lineId = created.id;
          summary.created++;
        }
        await recalcLine(tx, lineId, { userId: user.id });
        await syncLineFollowup(tx, lineId, { userId: user.id });
      }, { timeout: 20000 });
    } catch (e) {
      summary.failed++;
      summary.errors.push({ row: r.rowNumber, error: (e as Error).message });
    }
  }
  return summary;
}

// ─────────────────────────── Export ───────────────────────────

export const EXPORT_COLUMNS: { header: string; width: number; get: (l: ExportLine) => unknown }[] = [
  { header: "PO Number", width: 14, get: (l) => l.purchaseOrder.poNumber },
  { header: "PO Line", width: 8, get: (l) => l.lineNumber },
  { header: "Supplier Code", width: 12, get: (l) => l.purchaseOrder.supplier.code },
  { header: "Supplier Name", width: 28, get: (l) => l.purchaseOrder.supplier.name },
  { header: "Supplier Email", width: 26, get: (l) => l.purchaseOrder.supplier.email },
  { header: "Supplier Contact Person", width: 20, get: (l) => l.purchaseOrder.supplier.contactPerson ?? "" },
  { header: "Material Number", width: 16, get: (l) => l.materialNumber },
  { header: "Material Description", width: 34, get: (l) => l.materialDescription },
  { header: "Plant", width: 8, get: (l) => l.plant },
  { header: "Storage Location", width: 10, get: (l) => l.storageLocation ?? "" },
  { header: "Ordered Quantity", width: 12, get: (l) => num(l.orderedQty) },
  { header: "Delivered Quantity", width: 12, get: (l) => num(l.deliveredQty) },
  { header: "Received Quantity", width: 12, get: (l) => num(l.receivedQty) },
  { header: "Outstanding Quantity", width: 12, get: (l) => num(l.outstandingQty) },
  { header: "UOM", width: 6, get: (l) => l.uom },
  { header: "Unit Price", width: 12, get: (l) => num(l.unitPrice) },
  { header: "PO Creation Date", width: 12, get: (l) => fmtDate(l.purchaseOrder.poCreationDate) },
  { header: "PO Sent Date", width: 12, get: (l) => fmtDate(l.purchaseOrder.poSentDate) },
  { header: "Supplier Receipt Status", width: 14, get: (l) => titleCase(l.purchaseOrder.supplierReceiptStatus) },
  { header: "Supplier Receipt Date", width: 12, get: (l) => fmtDate(l.purchaseOrder.supplierReceiptDate) },
  { header: "Supplier Confirmation Status", width: 14, get: (l) => titleCase(l.confirmationStatus) },
  { header: "Original Requested Date", width: 12, get: (l) => fmtDate(l.originalRequestedDate) },
  { header: "Supplier Confirmed Date", width: 12, get: (l) => fmtDate(l.supplierConfirmedDate) },
  { header: "Latest Revised Date", width: 12, get: (l) => fmtDate(l.latestRevisedDate) },
  { header: "Expected Delivery Date", width: 12, get: (l) => fmtDate(effectiveDate(l)) },
  { header: "Followup Date", width: 12, get: (l) => fmtDate(l.followupDate) },
  { header: "Last Followup Date", width: 12, get: (l) => fmtDate(l.lastFollowupDate) },
  { header: "Next Followup Date", width: 12, get: (l) => fmtDate(l.nextFollowupDate) },
  { header: "Actual Delivery Date", width: 12, get: (l) => fmtDate(l.actualDeliveryDate) },
  { header: "GR Number", width: 12, get: (l) => l.lastGrNumber ?? "" },
  { header: "GR Date", width: 12, get: (l) => fmtDate(l.lastGrDate) },
  { header: "Buyer Name", width: 18, get: (l) => l.purchaseOrder.buyer.name },
  { header: "Buyer Email", width: 24, get: (l) => l.purchaseOrder.buyer.email },
  { header: "Status", width: 16, get: (l) => titleCase(l.status) },
  { header: "Remarks", width: 30, get: (l) => l.remarks ?? "" },
];

type ExportLine = Awaited<ReturnType<typeof exportLines>>[number];

async function exportLines(user: SessionUser, f: PoListFilters) {
  return prisma.purchaseOrderLine.findMany({
    where: lineWhere(user, f),
    include: lineListInclude,
    orderBy: [{ purchaseOrder: { poNumber: "asc" } }, { lineNumber: "asc" }],
    take: 20000,
  });
}

export async function exportData(user: SessionUser, f: PoListFilters, format: "xlsx" | "csv") {
  const lines = await exportLines(user, f);
  const table = lines.map((l) => EXPORT_COLUMNS.map((c) => c.get(l)));
  if (format === "csv") {
    return Buffer.from("﻿" + Papa.unparse({ fields: EXPORT_COLUMNS.map((c) => c.header), data: table }), "utf8");
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "SupplySync";
  const ws = wb.addWorksheet("PO Tracker", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  ws.addRows(table);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F4C81" } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

export async function templateWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PO Import");
  ws.columns = IMPORT_FIELDS.map((f) => ({ header: f.label, width: Math.max(14, f.label.length + 2) }));
  ws.addRow(["4500012345", 10, "SUP-1001", "Precision Castings Pvt Ltd", "orders@precisioncastings.example", "Rakesh Iyer", "MAT-100245", "Pump housing, cast iron GG25", "1100", "RM01", 250, "EA", 1850, "INR", "2026-10-01", "2026-10-02", "2026-11-15", "", "buyer@supplysync.demo", "Sample row – delete before import"]);
  ws.getRow(1).font = { bold: true };
  const notes = wb.addWorksheet("Instructions");
  notes.addRow(["Field", "Required", "Notes"]);
  for (const f of IMPORT_FIELDS) notes.addRow([f.label, f.required ? "Yes" : "No", f.key.includes("Date") ? "yyyy-mm-dd, dd.mm.yyyy or an Excel date" : ""]);
  notes.getColumn(1).width = 28;
  notes.getColumn(3).width = 50;
  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

export function errorReportCsv(errors: { row: number; error: string }[]) {
  return Papa.unparse({ fields: ["Row", "Error"], data: errors.map((e) => [e.row, e.error]) });
}
