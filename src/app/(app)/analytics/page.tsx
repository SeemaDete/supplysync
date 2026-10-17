import { requirePageUser } from "@/lib/session";
import { loadAnalytics } from "@/services/analytics-service";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { BucketChart, OtifTrendChart } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Analytics" };

type Kpi = { label: string; value: string; formula: string; target?: number; actual?: number; higherIsBetter?: boolean };

export default async function AnalyticsPage() {
  await requirePageUser("analytics:view");
  const { kpis: k, charts } = await loadAnalytics();

  const list: Kpi[] = [
    { label: "On-time delivery", value: `${k.onTimeDelivery}%`, actual: k.onTimeDelivery, target: 95, higherIsBetter: true, formula: "Lines whose first delivery date ≤ promised date ÷ lines with ≥1 delivery" },
    { label: "OTIF", value: `${k.otif}%`, actual: k.otif, target: 90, higherIsBetter: true, formula: "Lines fully delivered on/before promised date, qty exact, no discrepancy ÷ fully delivered lines" },
    { label: "Supplier response rate", value: `${k.supplierResponseRate}%`, actual: k.supplierResponseRate, target: 90, higherIsBetter: true, formula: "Sent follow-up emails with a supplier response within 3 days ÷ sent follow-up emails" },
    { label: "PO acknowledgement rate", value: `${k.acknowledgementRate}%`, actual: k.acknowledgementRate, target: 98, higherIsBetter: true, formula: "POs acknowledged by the supplier ÷ POs sent" },
    { label: "Confirmation rate", value: `${k.confirmationRate}%`, actual: k.confirmationRate, target: 95, higherIsBetter: true, formula: "Lines on sent POs with a supplier-confirmed date ÷ lines on sent POs" },
    { label: "Average delay", value: `${k.averageDelayDays} d`, actual: k.averageDelayDays, target: 2, higherIsBetter: false, formula: "Mean of max(completion date − promised date, 0) over fully delivered lines" },
    { label: "Pending GR %", value: `${k.pendingGrPct}%`, actual: k.pendingGrPct, target: 5, higherIsBetter: false, formula: "Σ (delivered − received) ÷ Σ delivered quantity" },
    { label: "Open orders", value: String(k.openOrders), formula: "Lines with outstanding qty > 0 on open POs" },
    { label: "Follow-up compliance", value: `${k.followupCompliance}%`, actual: k.followupCompliance, target: 95, higherIsBetter: true, formula: "Follow-ups completed on/before due date ÷ follow-ups that fell due (done + open past due)" },
    { label: "Overdue orders", value: String(k.overdueOrders), formula: "Open lines whose effective date (revised → confirmed → requested) is before today" },
    { label: "Delivery accuracy", value: `${k.deliveryAccuracy}%`, actual: k.deliveryAccuracy, target: 98, higherIsBetter: true, formula: "Fully delivered lines with delivered qty = ordered qty and no discrepancy ÷ fully delivered lines" },
  ];

  const ok = (x: Kpi) => x.target === undefined || x.actual === undefined ? null : x.higherIsBetter ? x.actual >= x.target : x.actual <= x.target;

  return (
    <>
      <PageHeader
        title="Supply performance analytics"
        description="Promised date = supplier confirmed date, else requested date. Revisions do not move the promise."
        actions={<Button asChild variant="outline" size="sm"><a href="/api/analytics" target="_blank" rel="noreferrer">JSON feed</a></Button>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {list.map((x) => {
          const good = ok(x);
          return (
            <Card key={x.label} className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{x.label}</p>
              <p className={cn("num mt-1 text-2xl font-semibold", good === false && "text-destructive", good === true && "text-emerald-600 dark:text-emerald-400")}>{x.value}</p>
              {x.target !== undefined && <p className="text-xs text-muted-foreground">Target {x.higherIsBetter ? "≥" : "≤"} {x.target}{x.label === "Average delay" ? " d" : "%"}</p>}
            </Card>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>OTIF trend</CardTitle><CardDescription>By month of completion</CardDescription></CardHeader>
          <CardContent><OtifTrendChart data={charts.otifTrend} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Overdue lines by days late</CardTitle></CardHeader>
          <CardContent><BucketChart data={charts.overdueBuckets} color="danger" name="Lines" /></CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Supplier scorecard</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>Supplier</TH><TH className="text-right">Open lines</TH><TH className="text-right">Overdue</TH><TH className="text-right">OTIF %</TH></TR></THead>
            <TBody>
              {charts.supplierPerformance.map((s) => (
                <TR key={s.name}><TD>{s.name}</TD><TD className="num text-right">{s.open}</TD><TD className="num text-right">{s.overdue}</TD><TD className="num text-right">{s.otif}%</TD></TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader><CardTitle>KPI formulas</CardTitle><CardDescription>Same definitions are used in the SQL reporting views for Power BI</CardDescription></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead><TR><TH>KPI</TH><TH>Formula</TH><TH className="text-right">Current</TH></TR></THead>
            <TBody>
              {list.map((x) => (
                <TR key={x.label}><TD className="whitespace-nowrap font-medium">{x.label}</TD><TD className="text-xs text-muted-foreground">{x.formula}</TD><TD className="num text-right">{x.value}</TD></TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
