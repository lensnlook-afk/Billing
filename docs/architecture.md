# Architecture decision

**Chosen deployment: cloud-hosted web application / PWA with Supabase PostgreSQL.** Existing Android phones, tablets, and future computers use the same HTTPS application. This avoids a local server or LAN while retaining a desktop-style POS interface on larger screens.

| Option | Decision |
| --- | --- |
| Cloud web + PWA | Primary: centrally managed, multi-user, remotely recoverable |
| Local LAN server | Not applicable: no dedicated hardware or LAN |
| Native mobile app | Future client over the same versioned API |
| Client-side offline billing | Rejected: it risks conflicting inventory, invoices, and payments |
| ChatGPT connector | Future read-only, permission-scoped tool layer; never direct DB access |

### Trust boundaries

The browser is untrusted. Every API route authenticates a session and checks permissions server-side. Supabase PostgreSQL is the financial and inventory source of truth. Transaction boundaries cover invoice number allocation, item snapshots, payments, stock movements/balances, audit events, and idempotent response storage. Values are calculated in integer paise in the service, while stored as `numeric(14,2)` in the database. The browser does not get a Supabase credential or direct table access.

### Reliability and recovery

Use a managed PostgreSQL service with daily encrypted backups, point-in-time recovery, an off-provider encrypted backup, and scheduled restore drills. Monitor `/healthz` and `/readyz`; alert on backup failure and database health. The UI may retain a *draft cart* in browser storage, but cannot submit it while offline. The audit ledger stores an append-only SHA-256 chain over a canonical payload; `/api/v1/audit/verify` checks the chain and its head during integrity monitoring.

### Scaling

The API is stateless and can scale horizontally. PostgreSQL locks the specific inventory balance rows and document sequence row during a sale. This prevents sales of the final item twice and duplicate invoice numbers. An idempotency key makes payment-sensitive retries safe.
