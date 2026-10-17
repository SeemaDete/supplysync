// Business dates are stored as Postgres DATE (no time). We represent them in JS as
// UTC-midnight Date objects and compute "today" in the plant timezone (APP_TIMEZONE).

const TZ = process.env.APP_TIMEZONE || "Asia/Kolkata";
const DAY = 86_400_000;

/** yyyy-mm-dd for the current calendar day in the app timezone */
export function todayISO(tz = TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts; // en-CA formats as yyyy-mm-dd
}

/** Today as a UTC-midnight Date (comparable with @db.Date values) */
export function today(): Date {
  return new Date(`${todayISO()}T00:00:00.000Z`);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY);
}

/** Parse "yyyy-mm-dd" (or any Date-ish) into a UTC-midnight Date. Returns null for blank. */
export function toDateOnly(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  }
  if (typeof v === "number") {
    // Excel serial date
    if (v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * DAY));
    return null;
  }
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(Date.UTC(+iso[1]!, +iso[2]! - 1, +iso[3]!));
  // dd.mm.yyyy (SAP) or dd/mm/yyyy
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (dmy) return new Date(Date.UTC(+dmy[3]!, +dmy[2]! - 1, +dmy[1]!));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function isoDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((toDateOnly(a)!.getTime() - toDateOnly(b)!.getTime()) / DAY);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 17-Oct-2026 style (common in Indian manufacturing / SAP exports) */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = new Date(d);
  if (isNaN(x.getTime())) return "—";
  return `${String(x.getUTCDate()).padStart(2, "0")}-${MONTHS[x.getUTCMonth()]}-${x.getUTCFullYear()}`;
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

/** Effective supplier date: latest revised → confirmed → originally requested */
export function effectiveDate(l: { latestRevisedDate?: Date | null; supplierConfirmedDate?: Date | null; originalRequestedDate: Date }): Date {
  return l.latestRevisedDate ?? l.supplierConfirmedDate ?? l.originalRequestedDate;
}
