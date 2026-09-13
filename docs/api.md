# API contract (v1)

All API responses use JSON. Authentication is the signed, HttpOnly `clarity_session` cookie. State-changing browser requests must originate at the configured `WEB_ORIGIN`; authorization is always evaluated by the API. Errors have `{ error: { code, message, requestId } }`.

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `POST /api/v1/auth/login` | Public | Creates a 12-hour session from username and password. |
| `POST /api/v1/auth/logout` | Signed-in | Revokes the current session. |
| `GET /api/v1/auth/me` | `dashboard.read` | Returns the signed-in identity and effective permissions. |
| `GET /api/v1/dashboard` | `dashboard.read` | Today’s posted invoice totals and low-stock count. |
| `GET/POST /api/v1/customers` | `customers.read` / `customers.write` | Search or create customers. Search accepts `q`, `limit`. |
| `GET/POST /api/v1/products` | `products.read` / `products.write` | Search catalog variants or create a product/variant. |
| `GET /api/v1/locations` | `inventory.read` | Active stock locations. |
| `POST /api/v1/inventory/receipts` | `inventory.adjust` | Append a reasoned stock-receipt ledger movement and update its balance projection. |
| `POST /api/v1/invoices` | `invoices.create` | Atomically post a sale. Requires a unique `Idempotency-Key` header. |
| `GET /api/v1/audit` | `audit.read` | Paginated audit viewing (current implementation supports `limit`). |
| `GET /api/v1/audit/verify` | `audit.read` | Verifies the audit hash-chain linkage and head. |
| `GET /healthz`, `GET /readyz` | Public/private-network only in production | Liveness and database readiness. |

`POST /api/v1/invoices` accepts a `locationId`, optional `customerId`, one or more `{variantId, quantity, discount?}` items, and zero or more `{amount, method, reference?}` payments. It derives prices and tax from server-side catalog records; the client cannot submit a selling-price override. A duplicate idempotency key with the same body returns the original result, while a changed body returns `409`. `POST /api/v1/inventory/receipts` requires a positive quantity and a mandatory reason; it is ledger-based, never a direct replacement of stock quantity.

Future API modules will preserve this `/api/v1` contract and add cursor pagination, order/prescription, purchase receiving, returns/refunds, approval, reports, and narrowly scoped AI-read endpoints.
