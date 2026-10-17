import Link from "next/link";
import {
  AlarmClock, AlertTriangle, CalendarCheck, CalendarClock, CalendarDays, ClipboardList, Factory, IndianRupee, PackageCheck, Timer,
} from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { loadAnalytics } from "@/services/analytics-service";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { BucketChart, BuyerWorkloadChart, MonthlyDeliveryChart, OtifTrendChart, SupplierPerformanceChart } from "@/components/charts";
import { fmtMoney } from "@/lib/utils";
import { fmtDate, today } from "@/lib/dates";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ mine?: string }> }) {
  const user = await requirePageUser("dashboard:view");
  const { mine } = await searchParams;
  const onlyMine = mine === "1" && user.role === "BUYER";
  const data = await loadAnalytics(onlyMine ? { buyerId: user.id } : {});
  const { cards, followups: f, charts, kpis } = data;

  return (
    <>
      <PageHeader
        title="Procurement cockpit"
        description={`Status as of ${fmtDate(today())}`}
        actions={
          user.role === "BUYER" ? (
            <Button asChild variant="outline" size="sm">
              <Link href={onlyMine ? "/dashboard" : "/dashboard?mine=1"}>{onlyMine ? "Show all buyers" : "Show only my POs"}</Link>
            </Button>
          ) : null
        }
      />

      {/* Executive cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard label="Open POs" value={cards.totalOpenPos} icon={ClipboardList} href="/purchase-orders" />
        <KpiCard label="Delayed POs" value={cards.delayedPos} icon={AlertTriangle} tone="red" href="/purchase-orders?overdue=1" />
        <KpiCard label="Due follow-ups" value={cards.dueFollowups} icon={AlarmClock} tone="amber" href="/followups" />
        <KpiCard label="Pending confirmation" value={cards.pendingConfirmation} sub="PO lines" icon={CalendarClock} tone="amber" />
        <KpiCard label="GR pending" value={cards.grPending} sub="PO lines" icon={PackageCheck} href="/purchase-orders?status=GR_PENDING" />
        <KpiCard label="Suppliers at risk" value={cards.suppliersAtRisk} icon={Factory} tone="red" />
        <KpiCard label="Total PO value" value={fmtMoney(cards.totalPoValue, cards.currency)} sub={`Open ${fmtMoney(cards.openPoValue, cards.currency)}`} icon={IndianRupee} tone="green" />
      </div>

      {/* Follow-up widgets */}
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Overdue follow-ups" value={f.overdue} icon={Timer} tone="red" href="/followups?bucket=overdue" />
        <KpiCard label="Due today" value={f.dueToday} icon={CalendarCheck} tone="amber" href="/followups?bucket=today" />
        <KpiCard label="Due tomorrow" value={f.dueTomorrow} icon={CalendarDays} href="/followups?bucket=tomorrow" />
        <KpiCard label="Due this week" value={f.dueThisWeek} icon={CalendarDays} href="/followups?bucket=week" />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly delivery trend</CardTitle>
            <CardDescription>Deliveries against the promised date, last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyDeliveryChart data={charts.monthlyDeliveries} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>OTIF %</CardTitle>
            <CardDescription>Current: {kpis.otif}% of {kpis.completedLines} completed lines</CardDescription>
          </CardHeader>
          <CardContent>
            <OtifTrendChart data={charts.otifTrend} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Supplier performance</CardTitle>
            <CardDescription>OTIF % by supplier (completed lines)</CardDescription>
          </CardHeader>
          <CardContent>
            <SupplierPerformanceChart data={charts.supplierPerformance} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top risk suppliers</CardTitle>
            <CardDescription>Score = 3×overdue + 2×unconfirmed + revisions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {charts.topRiskSuppliers.length === 0 && <p className="text-sm text-muted-foreground">No supplier is at risk right now.</p>}
            {charts.topRiskSuppliers.map((s) => (
              <div key={s.code} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.overdue} overdue · {s.pendingConf} unconfirmed · {s.revisions} revised
                  </p>
                </div>
                <Badge tone={s.riskScore >= 6 ? "red" : "amber"}>{s.riskScore}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overdue deliveries</CardTitle>
            <CardDescription>Open lines by days late</CardDescription>
          </CardHeader>
          <CardContent>
            <BucketChart data={charts.overdueBuckets} color="danger" name="Lines" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open PO aging</CardTitle>
            <CardDescription>Days since PO creation</CardDescription>
          </CardHeader>
          <CardContent>
            <BucketChart data={charts.aging} name="POs" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Buyer workload</CardTitle>
            <CardDescription>Open and overdue lines per buyer</CardDescription>
          </CardHeader>
          <CardContent>
            <BuyerWorkloadChart data={charts.buyerWorkload} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
