/* SupplySync demo data.
 * Run:  npm run db:seed
 * Resets all SupplySync tables, then creates users, suppliers, 12 scenario POs and ~5 months of history.
 * All dates are relative to the day you run it, so the dashboard always looks "live".
 */
import { PrismaClient, type RoleKey } from "@prisma/client";
import bcrypt from "bcryptjs";
import { recalcLine } from "../src/services/line-status";
import { syncLineFollowup } from "../src/services/followup-service";
import { addDays, today } from "../src/lib/dates";
import { DEFAULT_SETTINGS } from "../src/lib/settings";

const prisma = new PrismaClient();
const T = today();
const d = (n: number) => addDays(T, n);
const PASSWORD = "Demo@1234";

type LineSpec = {
  mat: string; desc: string; plant?: string; sloc?: string; qty: number; uom?: string; price: number; req: number;
  conf?: number; rev?: number; revReason?: string;
  deliveries?: { dn: string; at: number; qty: number }[];
  grs?: { gr: string; at: number; qty: number; dnIndex?: number }[];
};
type PoSpec = {
  po: string; supplier: string; buyer: "buyer" | "buyer2"; created: number; sent?: number; ack?: number; remarks?: string; lines: LineSpec[];
};

async function reset() {
  // Children first. Demo reset only – the application itself never hard-deletes.
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.communication.deleteMany();
  await prisma.goodsReceipt.deleteMany();
  await prisma.deliveryRecord.deleteMany();
  await prisma.supplierResponse.deleteMany();
  await prisma.followup.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.user.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.role.deleteMany();
  await prisma.setting.deleteMany();
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") {
    throw new Error("Refusing to reset a production database. Set SEED_FORCE=1 if you really mean it.");
  }
  console.log("Resetting demo data…");
  await reset();

  // ── Settings & roles
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) await prisma.setting.create({ data: { key, value: value as never } });
  const roleDefs: [RoleKey, string, string][] = [
    ["ADMIN", "Administrator", "Full access, users, settings, overrides"],
    ["BUYER", "Procurement Buyer", "Owns POs, follow-ups, supplier communication"],
    ["SUPPLIER", "Supplier", "Portal: acknowledge, confirm dates, upload documents"],
    ["LOGISTICS", "Logistics / Stores", "Deliveries and goods receipts"],
    ["MANAGEMENT", "Management", "Read-only dashboards and analytics"],
  ];
  const roles: Record<string, string> = {};
  for (const [key, name, description] of roleDefs) roles[key] = (await prisma.role.create({ data: { key, name, description } })).id;

  // ── Suppliers (realistic Indian manufacturing supply base)
  const supplierDefs = [
    { code: "SUP-1001", name: "Precision Castings Pvt Ltd", email: "orders@precisioncastings.demo", contactPerson: "Rakesh Iyer", phone: "+91 20 2712 4400", country: "India" },
    { code: "SUP-1002", name: "Bharat Forgings & Gears", email: "sales@bharatforgings.demo", contactPerson: "Sunil Patil", phone: "+91 231 265 1180", country: "India" },
    { code: "SUP-1003", name: "Sunrise Polymers Ltd", email: "dispatch@sunrisepolymers.demo", contactPerson: "Meera Shah", phone: "+91 79 2583 9010", country: "India" },
    { code: "SUP-1004", name: "Apex Electricals & Controls", email: "orders@apexelectricals.demo", contactPerson: "Arjun Menon", phone: "+91 80 4110 2233", country: "India" },
    { code: "SUP-1005", name: "Western Bearings Co.", email: "support@westernbearings.demo", contactPerson: "Farhan Qureshi", phone: "+91 22 6650 7788", country: "India" },
    { code: "SUP-1006", name: "Kaveri Packaging Solutions", email: "orders@kaveripack.demo", contactPerson: "Lakshmi Narayan", phone: "+91 44 2496 3300", country: "India" },
  ];
  const sup: Record<string, { id: string; name: string }> = {};
  for (const s of supplierDefs) sup[s.code] = await prisma.supplier.create({ data: s });

  // ── Users
  const hash = await bcrypt.hash(PASSWORD, 10);
  const mkUser = (email: string, name: string, role: RoleKey, extra: { supplierId?: string; canOverride?: boolean } = {}) =>
    prisma.user.create({ data: { email, name, passwordHash: hash, roleId: roles[role]!, supplierId: extra.supplierId ?? null, canOverride: extra.canOverride ?? false } });
  const admin = await mkUser("admin@supplysync.demo", "Priya Sharma", "ADMIN");
  const buyer = await mkUser("buyer@supplysync.demo", "Anita Desai", "BUYER", { canOverride: true });
  const buyer2 = await mkUser("buyer2@supplysync.demo", "Vikram Rao", "BUYER");
  const logistics = await mkUser("logistics@supplysync.demo", "Ramesh Kulkarni", "LOGISTICS");
  await mkUser("management@supplysync.demo", "Neha Kapoor", "MANAGEMENT");
  const supplierUser = await mkUser("supplier@precisioncastings.demo", "Rakesh Iyer", "SUPPLIER", { supplierId: sup["SUP-1001"]!.id });
  await mkUser("supplier@bharatforgings.demo", "Sunil Patil", "SUPPLIER", { supplierId: sup["SUP-1002"]!.id });
  await mkUser("supplier@sunrisepolymers.demo", "Meera Shah", "SUPPLIER", { supplierId: sup["SUP-1003"]!.id });
  const buyers = { buyer, buyer2 };

  // ── PO factory
  async function createPo(spec: PoSpec) {
    const sent = spec.sent !== undefined ? d(spec.sent) : null;
    const acked = spec.ack !== undefined;
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: spec.po, supplierId: sup[spec.supplier]!.id, buyerId: buyers[spec.buyer].id, currency: "INR",
        poCreationDate: d(spec.created), poSentDate: sent,
        supplierReceiptStatus: acked ? "ACKNOWLEDGED" : sent ? "PENDING" : "NOT_SENT",
        supplierReceiptDate: acked ? d(spec.ack!) : null,
        status: acked ? "OPEN" : sent ? "SENT" : "DRAFT", remarks: spec.remarks ?? null,
      },
    });
    await prisma.auditLog.create({ data: { entityType: "PurchaseOrder", entityId: po.id, poNumber: po.poNumber, action: "CREATE", afterValue: `${spec.lines.length} line(s)`, userId: buyers[spec.buyer].id, createdAt: d(spec.created) } });
    if (acked) {
      await prisma.communication.create({ data: { purchaseOrderId: po.id, channel: "SYSTEM", message: "Supplier acknowledged receipt of PO", createdAt: d(spec.ack!) } });
    }
    const lineIds: string[] = [];
    for (const [i, l] of spec.lines.entries()) {
      const line = await prisma.purchaseOrderLine.create({
        data: {
          purchaseOrderId: po.id, lineNumber: (i + 1) * 10, materialNumber: l.mat, materialDescription: l.desc,
          plant: l.plant ?? "1100", storageLocation: l.sloc ?? "RM01", uom: l.uom ?? "EA", unitPrice: l.price,
          orderedQty: l.qty, outstandingQty: l.qty, originalRequestedDate: d(l.req),
          supplierConfirmedDate: l.conf !== undefined ? d(l.conf) : null,
          confirmationStatus: l.rev !== undefined ? "REVISED" : l.conf !== undefined ? "CONFIRMED" : "PENDING",
          commitmentDate: l.rev !== undefined ? d(l.rev) : l.conf !== undefined ? d(l.conf) : null,
          dispatchedQty: (l.deliveries ?? []).reduce((s, x) => s + x.qty, 0),
        },
      });
      lineIds.push(line.id);
      if (l.conf !== undefined) {
        await prisma.supplierResponse.create({
          data: { lineId: line.id, responseDate: d(spec.ack ?? spec.created), deliveryConfirmed: true, confirmedDate: d(l.conf), recordedById: buyers[spec.buyer].id, viaPortal: spec.supplier === "SUP-1001" },
        });
      }
      const dels = [];
      for (const del of l.deliveries ?? []) {
        dels.push(await prisma.deliveryRecord.create({ data: { lineId: line.id, deliveryNote: del.dn, deliveryDate: d(del.at), quantity: del.qty, createdById: logistics.id, createdAt: d(del.at) } }));
      }
      for (const gr of l.grs ?? []) {
        await prisma.goodsReceipt.create({ data: { lineId: line.id, grNumber: gr.gr, grDate: d(gr.at), quantity: gr.qty, deliveryRecordId: dels[gr.dnIndex ?? 0]?.id ?? null, createdById: logistics.id, createdAt: d(gr.at) } });
      }
      await recalcLine(prisma, line.id, { grPendingAfterDays: DEFAULT_SETTINGS.grPendingAfterDays });
      await syncLineFollowup(prisma, line.id, { leadDays: DEFAULT_SETTINGS.followupLeadDays });
    }
    return { po, lineIds };
  }

  // ════════════════ 12 scenario POs ════════════════

  // 1. PO Sent – released today, supplier has not opened it yet
  await createPo({ po: "4500010001", supplier: "SUP-1004", buyer: "buyer", created: -1, sent: 0, lines: [
    { mat: "EL-220415", desc: "VFD 7.5 kW 415V, IP20", plant: "1100", sloc: "EL01", qty: 6, price: 48500, req: 21 },
    { mat: "EL-220988", desc: "MCCB 125A 4P 36kA", plant: "1100", sloc: "EL01", qty: 20, price: 7350, req: 21 },
  ] });

  // 2. Receipt Pending – sent 4 days ago, still not acknowledged
  await createPo({ po: "4500010002", supplier: "SUP-1005", buyer: "buyer2", created: -6, sent: -4, lines: [
    { mat: "BR-6205-2RS", desc: "Deep groove ball bearing 6205-2RS", sloc: "SP02", qty: 500, price: 145, req: 18 },
  ] });

  // 3. Confirmation Pending – acknowledged, no delivery date yet
  await createPo({ po: "4500010003", supplier: "SUP-1003", buyer: "buyer", created: -9, sent: -8, ack: -7, lines: [
    { mat: "PL-HDPE-50", desc: "HDPE granules, blow moulding grade", uom: "KG", qty: 2500, price: 112, req: 15 },
    { mat: "PL-PP-H110", desc: "PP homopolymer H110MA", uom: "KG", qty: 1500, price: 98, req: 15 },
  ] });

  // 4. Follow-up Due – confirmed date is exactly 7 days away → follow-up due today
  await createPo({ po: "4500010004", supplier: "SUP-1001", buyer: "buyer", created: -20, sent: -19, ack: -18, lines: [
    { mat: "MAT-100245", desc: "Pump housing, cast iron GG25, machined", qty: 250, price: 1850, req: 7, conf: 7 },
  ] });

  // 5. 3 Days to Delivery – follow-up was done 4 days ago by email
  const p5 = await createPo({ po: "4500010005", supplier: "SUP-1002", buyer: "buyer", created: -25, sent: -24, ack: -23, lines: [
    { mat: "FG-SH-4140", desc: "Drive shaft EN19 (AISI 4140), forged & turned", qty: 120, price: 3240, req: 3, conf: 3 },
  ] });
  {
    const f = await prisma.followup.findFirstOrThrow({ where: { lineId: p5.lineIds[0] } });
    await prisma.followup.update({ where: { id: f.id }, data: { dueDate: d(-4), status: "DONE", notifiedAt: d(-4), completedAt: d(-4), completedById: buyer.id, outcome: "Follow-up email sent" } });
    await prisma.purchaseOrderLine.update({ where: { id: p5.lineIds[0] }, data: { followupDate: d(-4), lastFollowupDate: d(-4), nextFollowupDate: null } });
    await prisma.communication.create({ data: {
      purchaseOrderId: p5.po.id, lineId: p5.lineIds[0], userId: buyer.id, channel: "EMAIL", emailStatus: "SENT", sentAt: d(-4), createdAt: d(-4),
      emailTo: "sales@bharatforgings.demo", emailCc: "buyer@supplysync.demo", emailSubject: "Delivery Confirmation Follow-up – PO 4500010005",
      message: "Dear Team,\n\nGreetings.\n\nPlease confirm status of following PO.\n\nPO: 4500010005 / Line 10\nMaterial: FG-SH-4140 – Drive shaft EN19\nOrdered Qty: 120 EA\nReceived Qty: 0 EA\nPending Qty: 120 EA\n\nKindly confirm delivery schedule.\n\nRegards,\nAnita Desai",
    } });
    await prisma.supplierResponse.create({ data: { lineId: p5.lineIds[0]!, responseDate: d(-3), deliveryConfirmed: true, confirmedDate: d(3), supplierComments: "Heat treatment complete, dispatch planned on schedule.", recordedById: buyer.id } });
  }

  // 6. Delivery Overdue – confirmed 6 days ago, nothing received, follow-up ignored
  const p6 = await createPo({ po: "4500010006", supplier: "SUP-1001", buyer: "buyer2", created: -40, sent: -39, ack: -37, lines: [
    { mat: "MAT-100318", desc: "Gearbox cover, SG iron 500/7", qty: 80, price: 2675, req: -10, conf: -6 },
  ] });
  {
    const f = await prisma.followup.findFirstOrThrow({ where: { lineId: p6.lineIds[0] } });
    await prisma.followup.update({ where: { id: f.id }, data: { dueDate: d(-13), notifiedAt: d(-13) } });
    await prisma.purchaseOrderLine.update({ where: { id: p6.lineIds[0] }, data: { followupDate: d(-13), nextFollowupDate: d(-13) } });
    await prisma.communication.create({ data: { purchaseOrderId: p6.po.id, userId: buyer2.id, channel: "COMMENT", message: "Rakesh, this is now overdue and line 2 at Chakan is waiting. Please share a firm dispatch date today.", createdAt: d(-2) } });
    await prisma.communication.create({ data: { purchaseOrderId: p6.po.id, userId: supplierUser.id, channel: "COMMENT", message: "Apologies – fettling backlog after the furnace shutdown. Will revert by tomorrow with the plan.", createdAt: d(-1) } });
  }

  // 7. Partial Delivery – 400 of 1000 delivered today, GR not yet posted
  await createPo({ po: "4500010007", supplier: "SUP-1006", buyer: "buyer2", created: -18, sent: -17, ack: -17, lines: [
    { mat: "PK-CB-5PLY", desc: "Corrugated box 5-ply 600×400×400", plant: "1200", sloc: "PK01", qty: 1000, price: 64, req: 6, conf: 5, deliveries: [{ dn: "KPS/DN/2291", at: 0, qty: 400 }] },
  ] });

  // 8. GR Pending – fully delivered 3 days ago, stores have not booked the GR
  await createPo({ po: "4500010008", supplier: "SUP-1004", buyer: "buyer", created: -30, sent: -29, ack: -28, lines: [
    { mat: "EL-PLC-S7", desc: "PLC CPU module with 16DI/16DO", sloc: "EL01", qty: 4, price: 68200, req: -3, conf: -3, deliveries: [{ dn: "AEC/DN/7781", at: -3, qty: 4 }] },
  ] });

  // 9. Fully Received – two deliveries and two GRs → PO closed automatically
  await createPo({ po: "4500010009", supplier: "SUP-1005", buyer: "buyer", created: -45, sent: -44, ack: -43, lines: [
    { mat: "BR-22216-E", desc: "Spherical roller bearing 22216 E", sloc: "SP02", qty: 60, price: 4120, req: -12, conf: -12,
      deliveries: [{ dn: "WB/DN/5520", at: -14, qty: 40 }, { dn: "WB/DN/5571", at: -11, qty: 20 }],
      grs: [{ gr: "5000043110", at: -14, qty: 40, dnIndex: 0 }, { gr: "5000043188", at: -10, qty: 20, dnIndex: 1 }] },
  ] });

  // 10. Revised Delivery Date – supplier moved the date out by 10 days; old follow-up superseded
  const p10 = await createPo({ po: "4500010010", supplier: "SUP-1002", buyer: "buyer", created: -28, sent: -27, ack: -26, lines: [
    { mat: "FG-GR-Z42", desc: "Spur gear Z42 M4, case hardened", qty: 200, price: 1960, req: 2, conf: 2 },
  ] });
  {
    const lineId = p10.lineIds[0]!;
    const old = await prisma.followup.findFirstOrThrow({ where: { lineId } });
    await prisma.followup.update({ where: { id: old.id }, data: { dueDate: d(-5), notifiedAt: d(-5) } });
    await prisma.purchaseOrderLine.update({ where: { id: lineId }, data: { latestRevisedDate: d(12), confirmationStatus: "REVISED", commitmentDate: d(12) } });
    await prisma.supplierResponse.create({ data: { lineId, responseDate: d(-2), deliveryConfirmed: true, revisedDate: d(12), previousDate: d(2), delayReason: "Machine breakdown", supplierComments: "Gear hobbing machine down; spares arriving Monday.", nextAction: "Check status after spares arrive", recordedById: buyer.id } });
    await prisma.auditLog.create({ data: { entityType: "PurchaseOrderLine", entityId: lineId, poNumber: "4500010010", action: "UPDATE", field: "latestRevisedDate", beforeValue: d(2).toISOString().slice(0, 10), afterValue: d(12).toISOString().slice(0, 10), reason: "Machine breakdown", userId: buyer.id, createdAt: d(-2) } });
    await prisma.communication.create({ data: { purchaseOrderId: p10.po.id, lineId, channel: "SYSTEM", message: "Line 10: delivery date revised → +10 days (reason: Machine breakdown)", createdAt: d(-2) } });
    await recalcLine(prisma, lineId);
    await syncLineFollowup(prisma, lineId, { leadDays: DEFAULT_SETTINGS.followupLeadDays }); // supersedes old, creates new (due T+5)
  }

  // 11. Multi-line PO – mixed states on one order
  await createPo({ po: "4500010011", supplier: "SUP-1001", buyer: "buyer", created: -22, sent: -21, ack: -20, remarks: "Tooling trial lot for new pump model", lines: [
    { mat: "MAT-100402", desc: "Impeller, CF8M stainless", qty: 150, price: 2380, req: 4, conf: 4, deliveries: [{ dn: "PCP/DN/1182", at: -1, qty: 150 }], grs: [{ gr: "5000043301", at: 0, qty: 150 }] },
    { mat: "MAT-100403", desc: "Bearing bracket, cast iron GG20", qty: 150, price: 1420, req: 9, conf: 9 },
    { mat: "MAT-100404", desc: "Seal housing, cast iron GG25", qty: 150, price: 980, req: 12 },
  ] });

  // 12. Discrepancy – more received paperwork than delivered (flagged for buyer)
  const p12 = await createPo({ po: "4500010012", supplier: "SUP-1003", buyer: "buyer2", created: -15, sent: -14, ack: -14, lines: [
    { mat: "PL-ABS-750", desc: "ABS granules, natural, injection grade", uom: "KG", qty: 1000, price: 165, req: -2, conf: -1, deliveries: [{ dn: "SPL/DN/0907", at: -1, qty: 1050 }] },
  ] });
  await prisma.purchaseOrderLine.update({ where: { id: p12.lineIds[0] }, data: { discrepancyFlag: true, remarks: "Over-delivery of 50 KG – awaiting return decision" } });
  await recalcLine(prisma, p12.lineIds[0]!);

  // ════════════════ History for trends (past ~5 months, closed POs) ════════════════
  const hist: [string, number, number, number][] = [
    // supplier, created offset, promised offset, actual delivery offset
    ["SUP-1001", -150, -120, -118], ["SUP-1002", -148, -122, -122], ["SUP-1003", -140, -112, -113], ["SUP-1004", -130, -100, -96],
    ["SUP-1005", -120, -95, -95], ["SUP-1006", -115, -90, -91], ["SUP-1001", -100, -75, -70], ["SUP-1002", -95, -70, -71],
    ["SUP-1003", -88, -62, -62], ["SUP-1004", -80, -55, -55], ["SUP-1005", -75, -48, -49], ["SUP-1001", -66, -40, -33],
    ["SUP-1006", -60, -35, -36], ["SUP-1002", -52, -28, -26], ["SUP-1003", -48, -22, -22], ["SUP-1005", -42, -18, -19],
  ];
  const mats = [
    ["MAT-100110", "Valve body, WCB cast steel", 1460], ["FG-FL-150", "Weld neck flange 6\" 150#", 2120], ["PL-NYL-66", "Nylon 66 GF30 granules", 285],
    ["EL-CBL-4C", "Armoured cable 4C×16 sq mm (m)", 640], ["BR-6308-ZZ", "Ball bearing 6308-ZZ", 410], ["PK-PAL-HT", "Heat-treated pallet 1200×1000", 1150],
  ] as const;
  let n = 0;
  for (const [s, created, promised, actual] of hist) {
    n++;
    const m = mats[n % mats.length]!;
    const qty = 50 + (n * 37) % 400;
    await createPo({ po: `45000099${String(n).padStart(2, "0")}`, supplier: s, buyer: n % 3 === 0 ? "buyer2" : "buyer", created, sent: created + 1, ack: created + 2, lines: [
      { mat: m[0], desc: m[1], qty, price: m[2], req: promised, conf: promised,
        deliveries: [{ dn: `DN/H/${1000 + n}`, at: actual, qty }], grs: [{ gr: `50000${40000 + n}`, at: actual + 1, qty }] },
    ] });
  }

  // ── A few in-app notifications so the bell isn't empty
  await prisma.notification.createMany({ data: [
    { userId: buyer.id, title: "Follow-up due: PO 4500010004/10", body: "Precision Castings – Pump housing. Supplier date in 7 days.", link: "/followups?bucket=today" },
    { userId: buyer.id, title: "Date revised – PO 4500010010", body: "Bharat Forgings moved line 10 by 10 days (machine breakdown).", link: "/purchase-orders" },
    { userId: buyer2.id, title: "Overdue delivery – PO 4500010006", body: "Gearbox cover is 6 days late.", link: "/purchase-orders?overdue=1" },
    { userId: logistics.id, title: "GR pending – PO 4500010008", body: "PLC CPU modules delivered 3 days ago, GR not posted.", link: "/deliveries?view=grpending" },
    { userId: supplierUser.id, title: "Please confirm – PO 4500010011", body: "Line 30 needs a delivery date.", link: "/portal" },
  ] });

  const counts = { users: await prisma.user.count(), suppliers: await prisma.supplier.count(), pos: await prisma.purchaseOrder.count(), lines: await prisma.purchaseOrderLine.count(), followups: await prisma.followup.count() };
  console.log("Seed complete:", counts);
  console.log(`\nDemo logins (password ${PASSWORD}):\n  admin@supplysync.demo\n  buyer@supplysync.demo\n  buyer2@supplysync.demo\n  logistics@supplysync.demo\n  management@supplysync.demo\n  supplier@precisioncastings.demo`);
  void admin;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
