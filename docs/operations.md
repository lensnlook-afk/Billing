# Production operations

* Terminate TLS at Caddy/Nginx or a managed ingress; set `COOKIE_SECURE=true` and a real `WEB_ORIGIN`.
* Put `DATABASE_URL` and `SESSION_SECRET` in a secret manager, never the web client or source control.
* Enable Postgres point-in-time recovery and daily encrypted backup; verify a restore monthly.
* Restrict database network access to the API and backup process. Employees have no database credentials.
* Send structured application logs to a retained log service. Audit logs are separate and must be monitored for chain failures.
* Update dependencies, run test and migration checks in CI, and require an owner approval workflow before enabling cancellations, refunds, stock adjustments, or high discounts.
