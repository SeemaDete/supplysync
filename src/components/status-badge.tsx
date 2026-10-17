import { Badge } from "@/components/ui/primitives";
import { titleCase } from "@/lib/utils";

type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "violet";

const TONES: Record<string, Tone> = {
  // line status
  OPEN: "blue",
  PARTIALLY_DELIVERED: "violet",
  DELIVERED: "violet",
  GR_PENDING: "amber",
  PARTIALLY_RECEIVED: "violet",
  FULLY_RECEIVED: "green",
  OVERDUE: "red",
  DISCREPANCY: "red",
  CLOSED: "neutral",
  // header status
  DRAFT: "neutral",
  SENT: "blue",
  CANCELLED: "neutral",
  // receipt / confirmation
  NOT_SENT: "neutral",
  PENDING: "amber",
  ACKNOWLEDGED: "green",
  CONFIRMED: "green",
  REVISED: "amber",
  REJECTED: "red",
  // follow-up / email
  DONE: "green",
  SUPERSEDED: "neutral",
  FAILED: "red",
};

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge tone={TONES[status] ?? "neutral"}>{label ?? titleCase(status)}</Badge>;
}
