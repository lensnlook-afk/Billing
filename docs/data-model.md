# Core data model

`users` ↔ `user_roles` ↔ `roles` ↔ `role_permissions` ↔ `permissions` provides extensible RBAC. `products` own independently sellable `product_variants`; `inventory_balances` is the current per-variant/location projection, while `inventory_movements` is the reconstructable ledger.

`invoices` own immutable `invoice_items` (pricing snapshots) and append-only `payments`. Financial correction is modelled with future void/refund/return entities, never deleting or rewriting a posted invoice. `idempotency_keys` holds a completed safe retry response. `audit_logs` is append-only, with each entry linking to the prior SHA-256 digest in the `global` chain.

All business timestamps use `timestamptz`; IDs are UUIDs; currency values use `numeric(14,2)`. Search-oriented indexes exist on product identifiers and customer mobile/name. Migration `001_initial.sql` is the authoritative schema.
