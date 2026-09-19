# Supabase Database Setup Guide

This guide takes you from a blank Supabase project to a fully running
Lens&Look database, step by step.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Supabase CLI](https://supabase.com/docs/guides/cli) | ≥ 1.168 | Push migrations, manage project |
| Node.js | ≥ 22 | Run the bootstrap-owner script |
| `psql` _(optional)_ | any | Manual SQL inspection |

Install the CLI:
```bash
brew install supabase/tap/supabase   # macOS
# or
npm install -g supabase
```

---

## 1. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and click **New project**.
2. Choose your organisation, pick a region close to India (e.g. **ap-south-1 Mumbai**), and set a strong database password. Save that password somewhere safe — you will need it once.
3. Wait for provisioning (~2 min).

---

## 2. Link the local repo to the project

```bash
# From the workspace root
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

Your project ref is the string in the dashboard URL:
`https://supabase.com/dashboard/project/<project-ref>`

---

## 3. Push the schema migration

```bash
supabase db push
```

This runs `supabase/migrations/20240001000000_initial_schema.sql` against your
remote database. It creates every table, index, enum, view, and RLS policy in
the correct order.

> **If the project already has stale tables from previous experiments**, reset
> it first via the Supabase dashboard → **Settings → Database → Reset database**,
> then re-run `supabase db push`.

Verify success:
```bash
supabase db diff   # should show no pending changes
```

---

## 4. Run the seed data

Open the Supabase dashboard → **SQL Editor**, paste the contents of
`supabase/seed.sql`, and click **Run**.

Or pipe it through `psql`:

```bash
psql "$DATABASE_URL" -f supabase/seed.sql
```

This inserts:
- 4 roles (Owner, Manager, Cashier, Inventory Staff)
- 23 permissions wired to those roles
- 3 locations (Badami, Ilkal, Main Stock Room)
- 9 product categories and 15 common eyewear brands
- Default system settings
- Document sequence rows for all number series

---

## 5. Create the first owner account

The application manages its own users — Supabase Auth is **not** used. Run the
bootstrap script from the API workspace:

```bash
cd apps/api
npx tsx src/bootstrap-owner.ts
```

The script will prompt for a login name, display name, and password, then
insert the user and assign the OWNER role. Use this account to log in to the
app and create additional users through the Settings → Employees UI.

---

## 6. Configure environment variables

Copy `apps/api/.env` (or `.env.example` at the root) and fill in the values
from the Supabase dashboard.

```bash
# apps/api/.env
DATABASE_URL=postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres
SESSION_SECRET=<random 32+ character string>
COOKIE_SECURE=true
WEB_ORIGIN=https://<your-frontend-domain>
PORT=3001
DATABASE_SSL=true
```

Find `DATABASE_URL` in **Supabase → Settings → Database → Connection string**
(use the **URI** tab, direct connection, not pooler).

Generate a strong `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## 7. Verify the connection

```bash
cd apps/api
npm run dev
# then in another terminal:
curl http://localhost:3001/readyz
# → {"status":"ready"}
```

---

## Schema overview

```
┌─────────────────────────────────────────────────────────┐
│  RBAC                                                   │
│  users → user_roles → roles → role_permissions →        │
│                               permissions               │
├─────────────────────────────────────────────────────────┤
│  Sessions  (HttpOnly cookie, 12 h, server-validated)    │
├─────────────────────────────────────────────────────────┤
│  Catalogue                                              │
│  categories · brands · suppliers                        │
│  products → product_variants                            │
├─────────────────────────────────────────────────────────┤
│  Inventory                                              │
│  locations                                              │
│  inventory_balances  (projection — current qty)         │
│  inventory_movements (ledger — every delta)             │
│  stock_adjustments   (owner-approved delta requests)    │
├─────────────────────────────────────────────────────────┤
│  Customers & Prescriptions                              │
│  customers → customer_prescriptions                     │
├─────────────────────────────────────────────────────────┤
│  Optical Orders                                         │
│  orders → order_items   (full optical lifecycle)        │
├─────────────────────────────────────────────────────────┤
│  Billing                                                │
│  document_sequences  (INV-YYYY-NNNNNN counters)         │
│  invoices → invoice_items                               │
│  payments                                               │
│  idempotency_keys    (safe POST /invoices retries)      │
├─────────────────────────────────────────────────────────┤
│  Purchasing                                             │
│  purchase_orders → purchase_order_items                 │
│  goods_receipts  → goods_receipt_items                  │
├─────────────────────────────────────────────────────────┤
│  Returns & Refunds                                      │
│  returns → return_items                                 │
│  refunds             (owner-approved)                   │
├─────────────────────────────────────────────────────────┤
│  Operations                                             │
│  employees · notifications · settings                   │
├─────────────────────────────────────────────────────────┤
│  Audit (append-only, SHA-256 hash chain)                │
│  audit_logs · audit_chain_heads                         │
└─────────────────────────────────────────────────────────┘
```

---

## Security model

| Layer | What it does |
|---|---|
| **API session auth** | Every request resolves an `Actor` from the `clarity_session` HttpOnly cookie via `sessions` + `user_roles` + `permissions`. No JWT, no Supabase client key in the browser. |
| **Permission check** | Every route uses `requirePermission('code')` — a missing permission returns 403. |
| **RLS (database)** | All tables have RLS enabled with **no policies** for `anon`/`authenticated`. Default-deny. The API server uses the **service role key** which bypasses RLS entirely. |
| **Audit chain** | Every mutation appends to `audit_logs` inside the same transaction. `UPDATE`, `DELETE`, `TRUNCATE` are revoked on `audit_logs`. Chain integrity is verifiable via `GET /api/v1/audit/verify`. |
| **Money arithmetic** | All financial calculations happen in integer paise (BigInt) server-side. Stored as `numeric(14,2)`. The browser never submits prices. |

---

## Supabase dashboard settings to check

After setup, go through these in the dashboard:

- **Authentication → Settings → Disable email sign-ups** — the app does not use
  Supabase Auth at all. Disable it to prevent confusion.
- **Settings → API → Restrict anon key** — since the browser never uses the
  anon key, you can also disable it or keep it but it will be harmless given
  the RLS lockout.
- **Settings → Database → Connection pooling** — for production use Transaction
  mode (port 6543) if you run many serverless/Edge function invocations. For
  the Docker/VPS deployment, direct connection (port 5432) is fine.
- **Settings → Backups** — enable daily backups and point-in-time recovery
  (PITR) on the Pro plan.

---

## Local development (no Supabase account needed)

```bash
# Start a local Supabase stack (Docker required)
supabase start

# Apply schema
supabase db reset   # runs migrations + seed automatically

# Your local DATABASE_URL will be printed by `supabase start`
# Typically: postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

`supabase db reset` drops the local database, re-runs all files in
`supabase/migrations/` in filename order, then runs `supabase/seed.sql`.

---

## Adding future migrations

Never edit `20240001000000_initial_schema.sql` after it has been applied.
Create a new file:

```bash
# The timestamp prefix keeps migrations ordered
supabase migration new <short_description>
# creates supabase/migrations/YYYYMMDDHHMMSS_<short_description>.sql
```

Write only the incremental `ALTER TABLE`, `CREATE TABLE`, etc. statements in
the new file, then:

```bash
supabase db push   # applies to remote
# or
supabase db reset  # rebuilds local from scratch
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `supabase db push` fails with "already exists" | Dashboard → Settings → Reset database, then re-push |
| `readyz` returns 500 | Check `DATABASE_URL` is the direct connection string (port 5432), not the pooler |
| Login always returns 401 | Run `bootstrap-owner.ts` — there are no users in the DB yet |
| `audit/verify` returns `valid: false` | The genesis hash in `audit_chain_heads` must be `'0'×64`. Re-run seed if row is missing |
| Seed `ON CONFLICT` errors | Safe to ignore — means data already exists from a previous seed run |
