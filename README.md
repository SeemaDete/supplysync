# SupplySync

**Supplier Collaboration & Purchase Order Visibility Platform**

SupplySync connects procurement buyers, suppliers, logistics/stores and management around one live view of every purchase order line — from release, supplier acknowledgement and date confirmation, through automatic follow-ups and partial deliveries, to goods receipt and closure. It replaces the follow-up email chase with a shared workflow and a full audit trail.

| | |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn-style components, Lucide, Recharts, dark/light mode |
| Backend | Next.js Route Handlers (REST) + service layer, Zod validation |
| Database | PostgreSQL (Supabase) with Prisma ORM |
| Auth | Auth.js v5 – Microsoft Entra ID + email/password, role-based access |
| Jobs | Vercel Cron → daily follow-up engine |
| Email | SMTP (Office 365, Gmail, SendGrid…) via Nodemailer, Outlook deep links |
| Files | Supabase Storage (or Postgres fallback) |
| Reporting | Excel/CSV export, SQL reporting views for Power BI, Power BI embed page |

---

## Quick start (local)

Requirements: Node.js 20+ and a PostgreSQL database (a free Supabase project is easiest).

```bash
npm install                       # also runs prisma generate
cp .env.example .env              # fill DATABASE_URL, DIRECT_URL, AUTH_SECRET at minimum
npx prisma migrate dev --name init  # creates all tables (commit the prisma/migrations folder)
npm run db:views                  # reporting views for Power BI (optional)
npm run db:seed                   # demo users, suppliers and 28 POs
npm run dev                       # http://localhost:3000
```

**Deploying to GitHub + Supabase + Vercel:** follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) step by step.

## Demo credentials

Password for every account: **`Demo@1234`**

| Role | Email | What to try |
|---|---|---|
| Admin | admin@supplysync.demo | Users, settings, run follow-up engine, overrides |
| Buyer | buyer@supplysync.demo | Dashboard, follow-ups, email supplier, record responses, overrides |
| Buyer 2 | buyer2@supplysync.demo | Second buyer for workload charts |
| Supplier | supplier@precisioncastings.demo | Portal: acknowledge, confirm/revise dates, dispatch, upload DN/ASN/invoice |
| Logistics / Stores | logistics@supplysync.demo | Deliveries & GR worklist |
| Management | management@supplysync.demo | Read-only dashboard and analytics |

Hide the demo buttons on the login page in production with `SHOW_DEMO_LOGINS=false`, and change or deactivate the demo users.

## Seeded scenarios

All dates are relative to the day you run the seed.

| PO | Scenario | What you see |
|---|---|---|
| 4500010001 | PO sent | Released today, receipt pending |
| 4500010002 | Receipt pending | Sent 4 days ago, not acknowledged |
| 4500010003 | Confirmation pending | Acknowledged, no supplier date |
| 4500010004 | Follow-up due | Confirmed date T+7 → follow-up due today |
| 4500010005 | 3 days to delivery | Follow-up done 4 days ago, email in history |
| 4500010006 | Delivery overdue | Confirmed T−6, nothing delivered, follow-up overdue, chat thread |
| 4500010007 | Partial delivery | 400 of 1,000 delivered today |
| 4500010008 | GR pending | Fully delivered 3 days ago, no GR |
| 4500010009 | Fully received | 2 deliveries + 2 GRs → PO auto-closed |
| 4500010010 | Revised delivery date | +10 days (machine breakdown); old follow-up superseded, new one calculated |
| 4500010011 | Multi-line | One line received, one confirmed, one unconfirmed |
| 4500010012 | Discrepancy | Over-delivery flagged |
| 4500009901–16 | History | Closed POs over 5 months for trend/OTIF charts |

## Demo workflow (end to end)

1. **Create PO** – Buyer → PO Tracker → *New PO* for **Precision Castings (SUP-1001)** (leave *PO sent date* empty) → *Release to supplier*.
2. **Supplier acknowledges** – sign in as supplier@precisioncastings.demo → portal → open the new PO → *Acknowledge PO*.
3. **Supplier confirms date** – *Confirm date* per line. Pick a date 7 days out.
4. **Follow-up generated** – immediately (and every morning via cron) a follow-up is created due on *date − 7 days*. See *Follow-ups → Due today*.
5. **Buyer sends email** – *Email* on the follow-up → preview/edit → *Send now* (or *Outlook web*). Sent only if SMTP accepts it; failures are stored as FAILED and the follow-up stays open.
6. **Supplier revises date** – portal → *Revise*, choose a delay reason. The old follow-up becomes *Superseded* and a new one is calculated; the revision appears in *Supplier responses* and *Audit*.
7. **Partial delivery entered** – logistics → *Deliveries & GR* → *Delivery* for part of the quantity → status *Partially delivered*.
8. **GR posted** – *GR* against the delivery. GR cannot exceed delivered quantity; received cannot exceed ordered.
9. **Dashboard updated** – cards, OTIF, overdue and workload charts reflect the change on refresh.
10. **PO closed** – deliver and GR the remainder → line *Fully received* → PO closes automatically (or *Close PO* to short-close with a reason).

## Project structure

```
supplysync/
├─ prisma/
│  ├─ schema.prisma            # 14 tables, enums, indexes
│  ├─ seed.ts                  # demo data
│  └─ sql/
│     ├─ reporting_views.sql   # Power BI views (reporting schema)
│     └─ performance_indexes.sql
├─ src/
│  ├─ auth.ts / auth.config.ts # Auth.js (Entra ID + credentials), edge-safe config
│  ├─ middleware.ts            # route protection, supplier ↔ internal separation
│  ├─ app/
│  │  ├─ login/                # sign-in page + server actions
│  │  ├─ (app)/                # internal app: dashboard, purchase-orders, followups,
│  │  │                        # deliveries, analytics, reports, import, audit, admin/*
│  │  ├─ portal/               # supplier portal
│  │  └─ api/                  # REST route handlers (see docs/ARCHITECTURE.md)
│  ├─ services/                # business logic (status engine, follow-ups, email, import…)
│  ├─ components/              # UI kit (ui/), shell, PO workspace, charts, wizards
│  ├─ lib/                     # prisma, rbac, validation (zod), dates, settings
│  └─ types/
├─ docs/
│  ├─ DEPLOYMENT.md            # GitHub → Supabase → Vercel, Entra ID, SMTP, cron
│  └─ ARCHITECTURE.md          # architecture, ERD, API, scheduler, KPIs, SAP, roadmap
├─ vercel.json                 # cron + region
└─ .env.example
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | `prisma generate && next build` (Vercel runs this) |
| `npm run typecheck` | Full TypeScript check |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy` | Apply committed migrations (production) |
| `npm run db:views` | Create/refresh Power BI reporting views |
| `npm run db:seed` | **Reset** and load demo data |
| `npm run db:studio` | Browse data in Prisma Studio |

## Key business rules

- **No hard deletes.** POs are archived/restored with a reason; GRs are reversed; users and suppliers are deactivated.
- **Status engine** (`src/services/line-status.ts`): Open → Partially delivered → Delivered → GR pending → Partially received → Fully received; Overdue when the effective date has passed with nothing received; Discrepancy on over-delivery; Closed via short-close or manual override. The PO header closes automatically when every line is fully received or closed.
- **Follow-up engine** (`src/services/followup-service.ts`): due = supplier date (revised → confirmed) − lead days (7 by default). Generated once per supplier date (unique key), recalculated on revision with history kept, notified once in-app and by email.
- **Email** never shows as sent unless the SMTP server accepted it.
- **Manual override** (Admin, or Buyer/Logistics with the *override* flag) writes user, time, before, after and reason to the audit log.
- **Supplier isolation**: suppliers only see their own released, non-archived POs and never see internal notes or follow-ups.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the ERD, API reference, KPI formulas, SAP integration approach and roadmap.

## A note on the first build

This repository was written without access to the npm registry, so it has no `package-lock.json` and has not been compiled end to end. `npm install` creates the lockfile (commit it). Type checking is set not to block Vercel deploys (`next.config.ts → typescript.ignoreBuildErrors`); run `npm run typecheck` locally or rely on the included GitHub Action, fix anything it reports, then set the flag to `false` for strict builds.
