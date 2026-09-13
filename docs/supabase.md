# Supabase deployment

Clarity uses **Supabase PostgreSQL only as managed infrastructure**. The browser does not use `supabase-js`, the anon key, or Supabase's generated Data API. All business requests go to the Clarity API, which keeps authorization, transaction boundaries, idempotency, and audit writing on the server.

## One-time setup

1. Create a Supabase project in the region nearest the store. Enable point-in-time recovery and daily backup retention on the appropriate Supabase plan.
2. From **Connect**, copy the **Transaction pooler** PostgreSQL URI (port `6543`) into your secret manager as `DATABASE_URL`. Append `sslmode=require` if it is absent.
3. Set `DATABASE_SSL=true`, a 32+ byte `SESSION_SECRET`, the exact public HTTPS URL as `WEB_ORIGIN`, and `COOKIE_SECURE=true` in the API service.
4. Run `npm run migrate --workspace=@clarity/api` from a trusted CI runner or an administrator machine with the secret injected. It records each applied migration in `schema_migrations`.
5. Set both Admin and Employee bootstrap variables, run the bootstrap once, then remove both password variables from the secret store.

The `anon` and `authenticated` database roles are explicitly denied access to all business tables in the first migration. Never put the Supabase `service_role` key, database URI, or any database credential in the browser.

## Connection and backup policy

The application keeps a small server-side `pg` pool; Supabase's transaction pooler handles application replicas. Use the direct connection only for exceptional administrative tasks that require session features. Supabase backups/PITR are the primary recovery point; maintain an encrypted periodic export in a separate provider and perform a restore drill at least quarterly.

## Auth choice

Supabase Auth is not used for employee sessions in this phase. Clarity stores a dedicated session record in PostgreSQL, hashes employee passwords with Argon2id, supports session revocation, and writes login events to the business audit ledger. This meets the application’s specific session/audit model while still using Supabase for its managed database, backup, monitoring, and access controls.
