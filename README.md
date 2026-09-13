# Clarity Optical

Cloud-first POS and ERP-lite for an independent optical retailer. The system is intentionally online-first: a transaction is only final after PostgreSQL commits the invoice, payment, inventory ledger, and audit event together.

## What is implemented

The initial operational foundation includes authenticated sessions, server-side RBAC, customers, catalog variants, inventory balances plus an immutable movement ledger, a transactionally issued invoice with one or more payments, dashboard metrics, idempotency support, and cryptographically chained audit events. The web client is a tablet/phone-friendly counter interface, not a local database.

Returns, purchase receiving, prescription capture, approval queues, reporting exports, printer adapters, and notification providers are deliberately modelled as next modules rather than claimed as complete.

The database integration was not executed in this workspace because no local PostgreSQL instance or running Docker daemon is available. The TypeScript application, unit tests, and production web/API builds have been verified; run the migration smoke test against your managed PostgreSQL staging database before accepting real transactions.

## Run locally

1. Create a Supabase project and configure its Transaction pooler URL as `DATABASE_URL`; see [Supabase deployment](docs/supabase.md).
2. Copy `.env.example` to `.env`, set `DATABASE_SSL=true`, and replace every placeholder.
3. Install packages: `npm install`.
4. Apply schema: `npm run migrate --workspace=@clarity/api`.
5. Create the Admin and Employee accounts from the bootstrap variables: `npm run bootstrap-owner --workspace=@clarity/api`.
6. Start API: `npm run dev:api`; in another terminal run `npm run dev`.

Open `http://localhost:5173`. For production, place the API behind HTTPS, set `COOKIE_SECURE=true`, use managed Postgres with PITR, and run migrations in CI/CD.

`docker-compose.production.yml` is a reference API/web deployment which connects to Supabase. Configure an external Caddy/Nginx or managed load balancer for HTTPS. The root [vercel.json](vercel.json) can instead deploy the UI and secure `/api` function on the same Vercel domain; set the server-only database/session variables in Vercel before going live.

## GitHub Pages preview

The fast static interface is published from the `gh-pages` branch at `/lens-and-look/`. GitHub Pages cannot run the authenticated API or hold database credentials. Deploy the API separately, build the frontend with its public `VITE_API_URL`, and add the resulting GitHub Pages URL to the API's `WEB_ORIGIN` configuration before enabling employee login.

## Design notes

See [architecture](docs/architecture.md), [data model](docs/data-model.md), and [operating guide](docs/operations.md). No database credential, owner password, or application secret is committed.
