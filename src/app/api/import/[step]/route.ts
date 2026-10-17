import { NextResponse } from "next/server";
import { z } from "zod";
import { withApi, readJson } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/session";
import { audit } from "@/services/audit-service";
import { prisma } from "@/lib/prisma";
import {
  autoMap, commitImport, errorReportCsv, IMPORT_FIELDS, parseFile, templateWorkbook, validateRows, type ImportField,
} from "@/services/import-export-service";

type P = { step: string };

const body = z.object({
  rows: z.array(z.record(z.unknown())).max(10000, "Max 10,000 rows per import"),
  mapping: z.record(z.string()),
  duplicateMode: z.enum(["skip", "update"]).default("skip"),
});

// GET /api/import/template → sample .xlsx
export const GET = withApi<P>(async (_req, { params }) => {
  const { step } = await params;
  if (step !== "template") throw new HttpError(404, "Unknown step");
  await requireApiUser("import:run");
  const buf = await templateWorkbook();
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="SupplySync_PO_Import_Template.xlsx"',
    },
  });
});

// POST /api/import/parse (multipart file) → headers, rows, suggested mapping
// POST /api/import/validate {rows, mapping} → per-row preview, errors, duplicates
// POST /api/import/commit {rows, mapping, duplicateMode} → summary + error report
export const POST = withApi<P>(async (req, { params }) => {
  const { step } = await params;
  const user = await requireApiUser("import:run");

  if (step === "parse") {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new HttpError(422, "Choose a file");
    const parsed = await parseFile(file);
    if (!parsed.rows.length) throw new HttpError(422, "The file has no data rows");
    return { ...parsed, fileName: file.name, suggestedMapping: autoMap(parsed.headers), fields: IMPORT_FIELDS };
  }

  const b = body.parse(await readJson(req));
  const mapping = b.mapping as Partial<Record<ImportField, string>>;
  if (step === "validate") {
    const { results, summary } = await validateRows(b.rows, mapping);
    return { summary, results: results.map(({ data: _d, ...r }) => r) };
  }
  if (step === "commit") {
    const summary = await commitImport(user, b.rows, mapping, b.duplicateMode);
    await audit(prisma, { entityType: "Import", entityId: new Date().toISOString(), action: "IMPORT", after: JSON.stringify({ ...summary, errors: summary.errors.length }), userId: user.id });
    return { ...summary, errorReportCsv: summary.errors.length ? errorReportCsv(summary.errors) : null };
  }
  throw new HttpError(404, "Unknown step");
});
