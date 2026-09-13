# RBAC baseline

| Permission | Owner | Manager | Cashier | Inventory staff |
| --- | :---: | :---: | :---: | :---: |
| Dashboard and catalog read | ✓ | ✓ | ✓ | ✓ |
| Customers | ✓ | ✓ | ✓ | — |
| Create invoices / payments | ✓ | ✓ | ✓ | — |
| Product management | ✓ | ✓ | — | ✓ |
| Inventory adjustment capability | ✓ | — | — | ✓ |
| Audit-log review | ✓ | — | — | — |
| User/security/settings management | ✓ | — | — | — |

Roles are data, not hard-coded route assumptions; effective permissions are resolved from `roles`, `permissions`, `user_roles`, and `role_permissions`. The current phase deliberately does **not** expose cancel, refund, price-override, or direct stock-adjustment routes. These will be added only with an owner approval workflow and tests.
