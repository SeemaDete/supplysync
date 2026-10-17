import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE = {
  default: "text-primary bg-accent",
  red: "text-red-600 bg-red-100 dark:bg-red-950 dark:text-red-300",
  amber: "text-amber-600 bg-amber-100 dark:bg-amber-950 dark:text-amber-300",
  green: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300",
};

export function KpiCard({
  label, value, sub, icon: Icon, tone = "default", href,
}: { label: string; value: React.ReactNode; sub?: string; icon: LucideIcon; tone?: keyof typeof TONE; href?: string }) {
  const body = (
    <div className={cn("flex h-full items-start justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm transition-colors", href && "hover:border-primary/40 hover:bg-accent/30")}>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="num mt-1 truncate text-2xl font-semibold">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
      <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md", TONE[tone])}>
        <Icon className="h-4 w-4" />
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
