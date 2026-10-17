"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Download, FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";

type Field = { key: string; label: string; required: boolean };
type Parsed = { headers: string[]; rows: Record<string, unknown>[]; fileName: string; suggestedMapping: Record<string, string>; fields: Field[] };
type RowResult = { rowNumber: number; status: "valid" | "error" | "duplicate"; errors: string[]; duplicateOf?: "file" | "database"; preview: Record<string, unknown> };
type Validation = { summary: { total: number; valid: number; errors: number; duplicatesInFile: number; duplicatesInDb: number }; results: RowResult[] };
type CommitResult = { created: number; updated: number; skipped: number; failed: number; suppliersCreated: number; errors: { row: number; error: string }[]; errorReportCsv: string | null };

const STEPS = ["Upload", "Map columns", "Preview & validate", "Summary"];

export function ImportWizard() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<Validation | null>(null);
  const [dupMode, setDupMode] = useState<"skip" | "update">("skip");
  const [filter, setFilter] = useState<"all" | "error" | "duplicate" | "valid">("all");
  const [result, setResult] = useState<CommitResult | null>(null);

  async function upload(file: File) {
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    try {
      const p = await api<Parsed>("/api/import/parse", { form });
      setParsed(p);
      setMapping(p.suggestedMapping);
      setStep(1);
      toast.success(`${p.rows.length} rows read from ${p.fileName}`);
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    if (!parsed) return;
    setBusy(true);
    try {
      const v = await api<Validation>("/api/import/validate", { body: { rows: parsed.rows, mapping } });
      setValidation(v);
      setStep(2);
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!parsed) return;
    setBusy(true);
    try {
      const r = await api<CommitResult>("/api/import/commit", { body: { rows: parsed.rows, mapping, duplicateMode: dupMode } });
      setResult(r);
      setStep(3);
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  function downloadErrors(csv: string) {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function errorCsvFromValidation() {
    if (!validation) return "";
    const rows = validation.results.filter((r) => r.errors.length);
    return ["Row,Error", ...rows.map((r) => `${r.rowNumber},"${r.errors.join("; ").replace(/"/g, '""')}"`)].join("\n");
  }

  const reset = () => { setStep(0); setParsed(null); setValidation(null); setResult(null); setMapping({}); };
  const missingRequired = parsed?.fields.filter((f) => f.required && !mapping[f.key]) ?? [];
  const shown = validation?.results.filter((r) => filter === "all" || r.status === filter) ?? [];

  return (
    <div className="grid gap-4">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 rounded-full border px-3 py-1 text-xs", i === step ? "border-primary bg-accent font-semibold text-accent-foreground" : i < step ? "text-muted-foreground" : "opacity-60")}>
            <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[10px]">{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload a PO extract</CardTitle>
            <CardDescription>CSV or Excel (.xlsx), first sheet, header in row 1. SAP ME2M / ME2N exports work – columns are matched automatically.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <label className={cn("flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-center hover:bg-muted/40", busy && "pointer-events-none opacity-60")}>
              {busy ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <FileUp className="h-8 w-8 text-muted-foreground" />}
              <span className="text-sm font-medium">Choose a file</span>
              <span className="text-xs text-muted-foreground">Max 4 MB · up to 10,000 rows</span>
              <input type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            </label>
            <div>
              <Button asChild variant="outline" size="sm"><a href="/api/import/template"><Download /> Download sample template</a></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && parsed && (
        <Card>
          <CardHeader>
            <CardTitle>Map columns</CardTitle>
            <CardDescription>{parsed.fileName} · {parsed.rows.length} rows · {parsed.headers.length} columns</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {parsed.fields.map((f) => (
                <div key={f.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-2">
                  <span className="text-sm">{f.label}{f.required && <span className="text-destructive"> *</span>}</span>
                  <Select value={mapping[f.key] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })} className={cn(f.required && !mapping[f.key] && "border-destructive")}>
                    <option value="">— not mapped —</option>
                    {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && <p className="text-xs text-destructive">Map required fields: {missingRequired.map((f) => f.label).join(", ")}</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={validate} disabled={busy || missingRequired.length > 0}>{busy && <Loader2 className="animate-spin" />} Validate</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && validation && (
        <Card>
          <CardHeader>
            <CardTitle>Preview & validation</CardTitle>
            <CardDescription>Nothing is saved until you click Import.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              {([
                ["all", `All ${validation.summary.total}`, "neutral"],
                ["valid", `Valid ${validation.summary.valid}`, "green"],
                ["duplicate", `Duplicates ${validation.summary.duplicatesInFile + validation.summary.duplicatesInDb}`, "amber"],
                ["error", `Errors ${validation.summary.errors}`, "red"],
              ] as const).map(([k, label, tone]) => (
                <button key={k} onClick={() => setFilter(k)} className={cn("rounded-full", filter === k && "ring-2 ring-ring")}>
                  <Badge tone={tone}>{label}</Badge>
                </button>
              ))}
            </div>
            {validation.summary.duplicatesInDb > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-amber-100 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <Copy className="h-4 w-4" /> {validation.summary.duplicatesInDb} rows already exist (same PO + line).
                <Select value={dupMode} onChange={(e) => setDupMode(e.target.value as "skip" | "update")} className="h-7 w-auto text-xs">
                  <option value="skip">Skip them</option>
                  <option value="update">Update them</option>
                </Select>
              </div>
            )}
            <div className="max-h-[420px] overflow-auto rounded-md border scrollbar-thin">
              <Table>
                <THead>
                  <TR><TH>Row</TH><TH>Result</TH><TH>PO</TH><TH>Line</TH><TH>Supplier</TH><TH>Material</TH><TH>Qty</TH><TH>Requested</TH><TH>Issues</TH></TR>
                </THead>
                <TBody>
                  {shown.slice(0, 500).map((r) => (
                    <TR key={r.rowNumber}>
                      <TD>{r.rowNumber}</TD>
                      <TD>{r.status === "valid" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : r.status === "duplicate" ? <Badge tone="amber">{r.duplicateOf === "file" ? "dup in file" : "exists"}</Badge> : <AlertCircle className="h-4 w-4 text-destructive" />}</TD>
                      <TD>{String(r.preview.poNumber ?? "")}</TD>
                      <TD>{String(r.preview.lineNumber ?? "")}</TD>
                      <TD>{String(r.preview.supplierCode ?? "")}</TD>
                      <TD className="max-w-[200px] truncate">{String(r.preview.materialNumber ?? "")} {String(r.preview.materialDescription ?? "")}</TD>
                      <TD>{String(r.preview.orderedQty ?? "")}</TD>
                      <TD>{String(r.preview.requestedDate ?? "")}</TD>
                      <TD className="text-xs text-destructive">{r.errors.join("; ")}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back to mapping</Button>
                {validation.summary.errors > 0 && <Button variant="outline" onClick={() => downloadErrors(errorCsvFromValidation())}><Download /> Error report</Button>}
              </div>
              <Button onClick={commit} disabled={busy || validation.summary.valid + (dupMode === "update" ? validation.summary.duplicatesInDb : 0) === 0}>
                {busy ? <Loader2 className="animate-spin" /> : <Upload />} Import {validation.summary.valid + (dupMode === "update" ? validation.summary.duplicatesInDb : 0)} rows
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && result && (
        <Card>
          <CardHeader><CardTitle>Import summary</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([["Created", result.created], ["Updated", result.updated], ["Skipped", result.skipped], ["Failed", result.failed], ["New suppliers", result.suppliersCreated]] as const).map(([l, v]) => (
                <div key={l} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="num text-xl font-semibold">{v}</p></div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Statuses and follow-ups were calculated for every imported line.</p>
            <div className="flex gap-2">
              {result.errorReportCsv && <Button variant="outline" onClick={() => downloadErrors(result.errorReportCsv!)}><Download /> Download error report</Button>}
              <Button asChild><a href="/purchase-orders">Open PO tracker</a></Button>
              <Button variant="ghost" onClick={reset}>Import another file</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
