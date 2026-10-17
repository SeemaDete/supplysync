import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Prisma Decimal | number | string | null → number */
export function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(typeof v === "object" ? String(v) : v);
  return Number.isFinite(n) ? n : 0;
}

export function fmtQty(v: unknown, digits = 0) {
  return num(v).toLocaleString("en-IN", { maximumFractionDigits: Math.max(digits, 3), minimumFractionDigits: digits });
}

export function fmtMoney(v: unknown, currency = "INR") {
  const n = num(v);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency, notation: n >= 1e7 ? "compact" : "standard", maximumFractionDigits: n >= 1e7 ? 2 : 0 }).format(n);
  } catch {
    return `${currency} ${n.toLocaleString("en-IN")}`;
  }
}

export function pct(numerator: number, denominator: number, digits = 1): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100 * 10 ** digits) / 10 ** digits;
}

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
