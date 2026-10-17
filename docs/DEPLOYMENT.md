# Deploying SupplySync: GitHub → Supabase → Vercel

This takes about 30–45 minutes the first time. You need free accounts on **GitHub**, **Supabase** and **Vercel**, and **Node.js 20+** plus **Git** on your computer.

> No local setup? Open the repository in **GitHub Codespaces** (green *Code* button → *Codespaces*) after Step 1 – it has Node and Git ready, and you can run Steps 3–4 in its terminal.

---

## Step 1 — Put the code on GitHub

1. Unzip `supplysync.zip` and open a terminal in the `supplysync` folder.
2. On github.com click **New repository** → name it `supplysync` → *Private* → **do not** add a README or .gitignore → *Create repository*.
3. In the terminal:

```bash
git init
git add .
git commit -m "SupplySync initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/supplysync.git
git push -u origin main
```

GitHub will ask you to sign in the first time (browser pop-up or a Personal Access Token as the password).

## Step 2 — Create the database on Supabase

1. supabase.com → **New project**. Name `supplysync`, choose a strong **database password** (save it), Region **South Asia (Mumbai)** – the app's Vercel region is also Mumbai (`bom1`), keeping queries fast.
2. When the project is ready, click **Connect** (top of the dashboard) → **ORMs** tab → **Prisma**. You will see two strings:
   - `DATABASE_URL` – the **transaction pooler**, port **6543**, ending in `?pgbouncer=true`
   - `DIRECT_URL` – the **session pooler**, port **5432**
3. Replace `[YOUR-PASSWORD]` in both with your database password. If your password contains `@ # / ?` etc., URL-encode them (e.g. `@` → `%40`).
4. Append `&connection_limit=1` to `DATABASE_URL` (recommended for serverless).

*(Optional, for file uploads)* **Storage → New bucket** → name `attachments` → keep it **private**. Then **Project Settings → API**: copy the **Project URL** and the **service_role** key (keep this secret – server only).

## Step 3 — Create your local `.env`

```bash
cp .env.example .env
```

Fill in at least:

| Variable | Value |
|---|---|
| `DATABASE_URL` | pooled string from Step 2 |
| `DIRECT_URL` | direct/session string from Step 2 |
| `AUTH_SECRET` | run `npx auth secret` or `openssl rand -base64 32` |
| `CRON_SECRET` | another random string |
| `APP_URL` | `http://localhost:3000` for now |

`.env` is in `.gitignore` – it never goes to GitHub.

## Step 4 — Create tables and demo data

```bash
npm install
npx prisma migrate dev --name init     # creates every table in Supabase
npm run db:views                       # Power BI reporting views (optional)
npm run db:seed                        # demo users + POs
npm run dev                            # open http://localhost:3000 and sign in as buyer@supplysync.demo / Demo@1234
```

Commit the generated migration and lockfile so Vercel and your team use the same schema:

```bash
git add prisma/migrations package-lock.json
git commit -m "Initial database migration"
git push
```

## Step 5 — Deploy on Vercel

1. vercel.com → **Add New… → Project** → **Import** your `supplysync` GitHub repo.
2. Framework preset: **Next.js** (auto-detected). Leave build settings as they are – `npm run build` already runs `prisma generate`.
3. Open **Environment Variables** and add (Production + Preview):

| Variable | Value |
|---|---|
| `DATABASE_URL` | same as local |
| `DIRECT_URL` | same as local |
| `AUTH_SECRET` | same as local (or a new one) |
| `AUTH_TRUST_HOST` | `true` |
| `CRON_SECRET` | same random string |
| `APP_URL` | `https://<your-project>.vercel.app` |
| `APP_TIMEZONE` | `Asia/Kolkata` |
| `SMTP_*` | see Step 7 (optional now) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | optional, Step 2 |
| `SHOW_DEMO_LOGINS` | `true` for a demo, `false` for real use |

4. Click **Deploy**. After ~2 minutes you get `https://<your-project>.vercel.app`. Open `/api/health` – it should return `{"ok":true,"db":"up"…}`.
5. To get `supplysync.vercel.app` specifically, name the Vercel project `supplysync` (if free). For `supplysync.company.com`: **Project → Settings → Domains → Add**, then create the CNAME record Vercel shows in your company DNS. Update `APP_URL` afterwards.

From now on **every `git push` to `main` deploys automatically**; pull requests get preview URLs.

### Future schema changes

```bash
# change prisma/schema.prisma, then locally:
npx prisma migrate dev --name describe_change
git add prisma && git commit -m "DB: describe change" && git push
npm run db:deploy        # applies the migration to Supabase (uses DIRECT_URL)
```

## Step 6 — Daily follow-up engine (Vercel Cron)

`vercel.json` already schedules `GET /api/cron/followups` at **01:30 UTC = 07:00 IST** every day. Vercel sends `Authorization: Bearer $CRON_SECRET`; the route rejects anything else. Check runs in **Vercel → Project → Settings → Cron Jobs** (or *Logs*). An Admin can also run it anytime: **Settings → Run follow-up engine now**.

Hobby plans allow daily crons; that is all SupplySync needs.

## Step 7 — Email (SMTP)

Pick one:

| Provider | SMTP_HOST | SMTP_PORT | SMTP_USER / SMTP_PASSWORD |
|---|---|---|---|
| Microsoft 365 | `smtp.office365.com` | 587 | a licensed mailbox; SMTP AUTH must be enabled for it in the M365 admin centre |
| Gmail / Google Workspace | `smtp.gmail.com` | 587 | the address + an **App Password** (needs 2-step verification) |
| SendGrid | `smtp.sendgrid.net` | 587 | `apikey` / your API key |
| Resend | `smtp.resend.com` | 465 | `resend` / your API key |

Set `SMTP_FROM`, e.g. `SupplySync <procurement@company.com>` (must be allowed to send from that mailbox/domain). Redeploy after adding variables (**Deployments → … → Redeploy**). **Settings → Integrations** shows whether SMTP is configured. Without SMTP everything else works; *Send now* records a FAILED email and buyers use *Outlook web* / *Desktop mail* instead.

## Step 8 — Microsoft Entra ID sign-in (optional)

1. portal.azure.com → **Microsoft Entra ID → App registrations → New registration**.
   - Name `SupplySync`; *Accounts in this organizational directory only*.
   - Redirect URI: platform **Web**, `https://<your-domain>/api/auth/callback/microsoft-entra-id` (add `http://localhost:3000/api/auth/callback/microsoft-entra-id` too for local testing).
2. **Overview**: copy *Application (client) ID* and *Directory (tenant) ID*.
3. **Certificates & secrets → New client secret** → copy the **Value**.
4. In Vercel add:
   - `AUTH_MICROSOFT_ENTRA_ID_ID` = client ID
   - `AUTH_MICROSOFT_ENTRA_ID_SECRET` = secret value
   - `AUTH_MICROSOFT_ENTRA_ID_ISSUER` = `https://login.microsoftonline.com/<tenant-id>/v2.0`
5. Redeploy. The **Sign in with Microsoft** button appears automatically.
6. Users must exist in SupplySync first (**Admin → Users**, same email as their Microsoft account) – this prevents anyone in the tenant from self-registering. Suppliers normally keep email + password.

## Step 9 — Go-live checklist

- [ ] Change or deactivate all `*.demo` users; create real users (Admin → Users)
- [ ] `SHOW_DEMO_LOGINS=false`
- [ ] Re-seed only on a demo database – `db:seed` **erases** data (it refuses when `NODE_ENV=production` unless `SEED_FORCE=1`)
- [ ] SMTP configured and a test email sent
- [ ] Supabase **Database → Backups** enabled (daily backups are on paid plans; otherwise schedule `pg_dump`)
- [ ] Settings → follow-up lead days / GR pending days agreed with procurement
- [ ] Custom domain + `APP_URL` updated
- [ ] Optional: `npx prisma db execute --file prisma/sql/performance_indexes.sql --schema prisma/schema.prisma`

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails at `prisma generate` | Check the Vercel build log; make sure `DATABASE_URL` is set for the environment being built |
| `/api/health` → `db: down`, "Can't reach database server" | Wrong password/host in `DATABASE_URL`; special characters not URL-encoded; Supabase project paused (free tier pauses after inactivity – resume it) |
| "prepared statement already exists" | `DATABASE_URL` must use port 6543 **with** `?pgbouncer=true` |
| `migrate dev` hangs or fails | It must use `DIRECT_URL` (port 5432); check that variable |
| Sign-in loops back to /login | `AUTH_SECRET` missing in Vercel, or `AUTH_TRUST_HOST` not `true` |
| Microsoft sign-in "AccessDenied" | User's email is not in Admin → Users, or is inactive |
| Microsoft "redirect URI mismatch" | Redirect URI in Azure must exactly match `https://<domain>/api/auth/callback/microsoft-entra-id` |
| Email shows FAILED | Open the PO → Communication: the SMTP error is shown under the message |
| Uploads > 4 MB fail | Vercel limits request bodies to ~4.5 MB; compress the PDF |
| Type errors | Run `npm run typecheck` locally and fix; the GitHub Action shows them on every push |
