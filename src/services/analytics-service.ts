import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, diffDays, today, effectiveDate } from "@/lib/dates";
import { num, pct } from "@/lib/utils";
import { getSettings } from "@/lib/settings";
import { followupBuckets } from "@/services/followup-service";

/**
 * KPI DEFINITIONS (also shown on the Analytics page)
 *
 * Promised date        = supplier confirmed date, else original requested date (revisions do NOT move the promise)
 * Completion date      = date of the delivery that brought delivered qty ≥ ordered qty
 *
 * On-Time Delivery %   = lines whose first delivery date ≤ promised date ÷ lines with at least one delivery
 * OTIF %               = lines fully delivered on/before promised date with no discrepancy ÷ fully delivered lines
 * Supplier Response %  = follow-up emails SENT that received a supplier response within 3 days ÷ follow-up emails SENT
 * PO Acknowledgement % = POs acknowledged by supplier ÷ POs sent
 * Confirmation %       = sent-PO lines with a confirmed date ÷ sent-PO lines
 * Average Delay (days) = mean of max(completion date − promised date, 0) over fully delivered lines
 * Pending GR %         = Σ(delivered − received) ÷ Σ delivered
 * Open Orders          = lines with outstanding qty > 0 on open POs
 * Follow-up Compliance = follow-ups completed on/before due date ÷ follow-ups that were due (DONE + OPEN past due)
 * Overdue Orders       = open lines whose effective date (revised → confirmed → requested) < today
 * Delivery Accuracy %  = delivered lines with delivered qty == ordered qty and no discrepancy ÷ fully delivered lines
 */

type Scope = { buyerId?: string };

export async function loadAnalytics(scope: Scope = {}) {
  const settings = await getSettings();
  const now = today();
  const poWhere: Prisma.PurchaseOrderWhereInput = { archivedAt: null, ...(scope.buyerId ? { buyerId: scope.buyerId } : {}) };

  const lines = await prisma.purchaseOrderLine.findMany({
    where: { purchaseOrder: poWhere },
    select: {
      id: true, orderedQty: true, deliveredQty: true, receivedQty: true, outstandingQty: true, unitPrice: true, status: true,
      discrepancyFlag: true, confirmationStatus: true, originalRequestedDate: true, supplierConfirmedDate: true, latestRevisedDate: true,
      purchaseOrder: {
        select: {
          id: true, poNumber: true, status: true, poCreationDate: true, poSentDate: true, supplierReceiptStatus: true, currency: true,
          supplier: { select: { id: true, name: true, code: true } },
          buyer: { select: { id: true, name: true } },
        },
      },
      deliveries: { select: { deliveryDate: true, quantity: true }, orderBy: { deliveryDate: "asc" } },
    },
  });

  type L = (typeof lines)[number];
  const isOpenPo = (l: L) => l.purchaseOrder.status === "SENT" || l.purchaseOrder.status === "OPEN";
  const isOpenLine = (l: L) => isOpenPo(l) && num(l.outstandingQty) > 0 && l.status !== "CLOSED" && l.status !== "FULLY_RECEIVED";
  const promised = (l: L) => l.supplierConfirmedDate ?? l.originalRequestedDate;
  const completion = (l: L): Date | null => {
    let cum = 0;
    for (const d of l.deliveries) {
      cum += num(d.quantity);
      if (cum >= num(l.orderedQty)) return d.deliveryDate;
    }
    return null;
  };
  const isOverdue = (l: L) => isOpenLine(l) && num(l.orderedQty) > num(l.deliveredQty) && effectiveDate(l) < now;

  const openLines = lines.filter(isOpenLine);
  const overdueLines = lines.filter(isOverdue);
  const delivered = lines.filter((l) => l.deliveries.length > 0);
  const completed = lines.filter((l) => completion(l));
  const sentLines = lines.filter((l) => l.purchaseOrder.poSentDate);

  const onTimeFirst = delivered.filter((l) => l.deliveries[0]!.deliveryDate <= promised(l)).length;
  const otif = completed.filter((l) => completion(l)! <= promised(l) && !l.discrepancyFlag && num(l.deliveredQty) === num(l.orderedQty)).length;
  const accurate = completed.filter((l) => !l.discrepancyFlag && num(l.deliveredQty) === num(l.orderedQty)).length;
  const delays = completed.map((l) => Math.max(diffDays(completion(l)!, promised(l)), 0));
  const avgDelay = delays.length ? Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10 : 0;
  const totalDelivered = lines.reduce((s, l) => s + num(l.deliveredQty), 0);
  const pendingGrQty = lines.reduce((s, l) => s + Math.max(num(l.deliveredQty) - num(l.receivedQty), 0), 0);

  // PO-level
  const pos = new Map<string, L["purchaseOrder"]>();
  for (const l of lines) pos.set(l.purchaseOrder.id, l.purchaseOrder);
  const poList = [...pos.values()];
  const sentPos = poList.filter((p) => p.poSentDate);
  const ackPos = sentPos.filter((p) => p.supplierReceiptStatus === "ACKNOWLEDGED");
  const openPos = poList.filter((p) => p.status === "SENT" || p.status === "OPEN");
  const delayedPoIds = new Set(overdueLines.map((l) => l.purchaseOrder.id));

  // Follow-ups
  const fWhere: Prisma.FollowupWhereInput = { line: { purchaseOrder: poWhere } };
  const followups = await prisma.followup.findMany({ where: { ...fWhere, status: { in: ["DONE", "OPEN"] } }, select: { status: true, dueDate: true, completedAt: true } });
  const dueFollowups = followups.filter((f) => f.status === "DONE" || f.dueDate < now);
  const compliant = followups.filter((f) => f.status === "DONE" && f.completedAt && new Date(f.completedAt.toISOString().slice(0, 10)) <= f.dueDate).length;
  const buckets = await followupBuckets(fWhere);

  // Supplier response rate on sent follow-up emails
  const emails = await prisma.communication.findMany({
    where: { channel: "EMAIL", emailStatus: "SENT", purchaseOrder: poWhere },
    select: { sentAt: true, purchaseOrderId: true, lineId: true },
  });
  const responses = await prisma.supplierResponse.findMany({
    where: { line: { purchaseOrder: poWhere }, responseReceived: true },
    select: { responseDate: true, line: { select: { id: true, purchaseOrderId: true } } },
  });
  const responded = emails.filter((e) => {
    if (!e.sentAt) return false;
    const start = new Date(e.sentAt.toISOString().slice(0, 10));
    const end = addDays(start, 3);
    return responses.some((r) => (e.lineId ? r.line.id === e.lineId : r.line.purchaseOrderId === e.purchaseOrderId) && r.responseDate >= start && r.responseDate <= end);
  }).length;

  const kpis = {
    onTimeDelivery: pct(onTimeFirst, delivered.length),
    otif: pct(otif, completed.length),
    supplierResponseRate: pct(responded, emails.length),
    acknowledgementRate: pct(ackPos.length, sentPos.length),
    confirmationRate: pct(sentLines.filter((l) => l.supplierConfirmedDate).length, sentLines.length),
    averageDelayDays: avgDelay,
    pendingGrPct: pct(pendingGrQty, totalDelivered),
    openOrders: openLines.length,
    followupCompliance: pct(compliant, dueFollowups.length),
    overdueOrders: overdueLines.length,
    deliveryAccuracy: pct(accurate, completed.length),
    // supporting counts
    deliveredLines: delivered.length,
    completedLines: completed.length,
    emailsSent: emails.length,
  };

  // Cards
  const supplierStats = new Map<string, { name: string; code: string; total: number; open: number; overdue: number; completed: number; otif: number; pendingConf: number; revisions: number }>();
  for (const l of lines) {
    const s = l.purchaseOrder.supplier;
    const st = supplierStats.get(s.id) ?? { name: s.name, code: s.code, total: 0, open: 0, overdue: 0, completed: 0, otif: 0, pendingConf: 0, revisions: 0 };
    st.total++;
    if (isOpenLine(l)) st.open++;
    if (isOverdue(l)) st.overdue++;
    const c = completion(l);
    if (c) {
      st.completed++;
      if (c <= promised(l) && !l.discrepancyFlag) st.otif++;
    }
    if (l.purchaseOrder.poSentDate && l.confirmationStatus === "PENDING" && isOpenLine(l)) st.pendingConf++;
    if (l.latestRevisedDate) st.revisions++;
    supplierStats.set(s.id, st);
  }
  const supplierPerformance = [...supplierStats.values()]
    .map((s) => ({ ...s, otifPct: s.completed ? pct(s.otif, s.completed) : null, riskScore: s.overdue * 3 + s.pendingConf * 2 + s.revisions }))
    .sort((a, b) => b.riskScore - a.riskScore);
  const suppliersAtRisk = supplierPerformance.filter((s) => s.overdue >= settings.riskOverdueThreshold || (s.otifPct !== null && s.otifPct < 70 && s.open > 0));

  const cards = {
    totalOpenPos: openPos.length,
    delayedPos: delayedPoIds.size,
    dueFollowups: buckets.overdue + buckets.dueToday,
    pendingConfirmation: openLines.filter((l) => l.purchaseOrder.poSentDate && l.confirmationStatus === "PENDING").length,
    grPending: lines.filter((l) => num(l.deliveredQty) > num(l.receivedQty) && l.status !== "CLOSED").length,
    suppliersAtRisk: suppliersAtRisk.length,
    totalPoValue: lines.reduce((s, l) => s + num(l.orderedQty) * num(l.unitPrice), 0),
    openPoValue: openLines.reduce((s, l) => s + num(l.outstandingQty) * num(l.unitPrice), 0),
    currency: lines[0]?.purchaseOrder.currency ?? "INR",
  };

  // Monthly delivery trend (last 6 months) with on-time split
  const months: { key: string; label: string; onTime: number; late: number; quantity: number }[] = [];
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) + " " + String(d.getUTCFullYear()).slice(2), onTime: 0, late: 0, quantity: 0 });
  }
  const otifByMonth = new Map<string, { ok: number; total: number }>();
  for (const l of lines) {
    for (const d of l.deliveries) {
      const m = months.find((x) => x.key === d.deliveryDate.toISOString().slice(0, 7));
      if (!m) continue;
      if (d.deliveryDate <= promised(l)) m.onTime++;
      else m.late++;
      m.quantity += num(d.quantity);
    }
    const c = completion(l);
    if (c) {
      const k = c.toISOString().slice(0, 7);
      const o = otifByMonth.get(k) ?? { ok: 0, total: 0 };
      o.total++;
      if (c <= promised(l) && !l.discrepancyFlag) o.ok++;
      otifByMonth.set(k, o);
    }
  }
  const otifTrend = months.map((m) => {
    const o = otifByMonth.get(m.key);
    return { label: m.label, otif: o ? pct(o.ok, o.total) : null };
  });

  // Buyer workload
  const buyerMap = new Map<string, { name: string; openLines: number; overdue: number }>();
  for (const l of openLines) {
    const b = l.purchaseOrder.buyer;
    const x = buyerMap.get(b.id) ?? { name: b.name, openLines: 0, overdue: 0 };
    x.openLines++;
    if (isOverdue(l)) x.overdue++;
    buyerMap.set(b.id, x);
  }

  // Open PO aging by PO creation date
  const aging = [
    { bucket: "0–30 d", count: 0 },
    { bucket: "31–60 d", count: 0 },
    { bucket: "61–90 d", count: 0 },
    { bucket: "90+ d", count: 0 },
  ];
  for (const p of openPos) {
    const age = diffDays(now, p.poCreationDate);
    aging[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3]!.count++;
  }

  // Overdue deliveries by days late
  const overdueBuckets = [
    { bucket: "1–7 d", count: 0 },
    { bucket: "8–14 d", count: 0 },
    { bucket: "15–30 d", count: 0 },
    { bucket: "30+ d", count: 0 },
  ];
  for (const l of overdueLines) {
    const late = diffDays(now, effectiveDate(l));
    overdueBuckets[late <= 7 ? 0 : late <= 14 ? 1 : late <= 30 ? 2 : 3]!.count++;
  }

  return {
    kpis,
    cards,
    followups: buckets,
    charts: {
      monthlyDeliveries: months.map(({ label, onTime, late, quantity }) => ({ label, onTime, late, quantity })),
      otifTrend,
      supplierPerformance: supplierPerformance.slice(0, 10).map((s) => ({ name: s.name, otif: s.otifPct ?? 0, open: s.open, overdue: s.overdue })),
      buyerWorkload: [...buyerMap.values()].sort((a, b) => b.openLines - a.openLines),
      aging,
      overdueBuckets,
      topRiskSuppliers: supplierPerformance.filter((s) => s.riskScore > 0).slice(0, 5),
    },
  };
}

export type AnalyticsData = Awaited<ReturnType<typeof loadAnalytics>>;
