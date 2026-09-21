import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { z } from 'zod';
import { pool, transaction } from './lib/db.js';
import { config } from './lib/config.js';
import { AppError } from './lib/errors.js';
import { clientIp, createToken, getActor, passwordVerify, sessionCookie, sessionCookieOptions, tokenHash, type Actor } from './lib/auth.js';
import { audit } from './lib/audit.js';
import { postSale, type SaleInput } from './services/invoice-service.js';

declare module 'fastify' { interface FastifyRequest { actor: Actor | null; } }

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, requestIdHeader: 'x-request-id', genReqId: () => randomUUID() });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cookie);

function isAllowedOrigin(origin: string): boolean {
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true;
  if (origin === config.WEB_ORIGIN) return true;
  if (/^https:\/\/billing-[^.]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

await app.register(cors, {
  origin: (origin, cb) => { if (!origin || isAllowedOrigin(origin)) return cb(null, true); cb(new Error('Not allowed by CORS'), false); },
  credentials: true,
});

app.addHook('onRequest', async (request) => {
  request.actor = await getActor(request);
});

app.setErrorHandler((error, request, reply) => {
  const isZodError = error instanceof z.ZodError;
  const status = error instanceof AppError ? error.statusCode : isZodError ? 422 : 500;
  request.log.error({ err: error, requestId: request.id }, 'request failed');
  // In production expose real message for all errors so we can debug
  reply.status(status).send({ error: {
    code: error instanceof AppError ? error.code : isZodError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : 'Request failed.',
    requestId: request.id,
  }});
});

function requirePermission(permission: string) {
  return async (request: FastifyRequest) => {
    if (!request.actor) throw new AppError(401, 'Sign in is required.', 'UNAUTHENTICATED');
    if (!request.actor.permissions.has(permission)) throw new AppError(403, 'You do not have permission for this action.', 'FORBIDDEN');
  };
}

function isAdmin(actor: Actor) { return actor.roles.includes('OWNER'); }

// ── Auth ──────────────────────────────────────────────────────────────────────
const loginSchema = z.object({ identifier: z.string().trim().min(2).max(80), password: z.string().min(1).max(256) });

app.post('/api/v1/auth/login', async (request, reply) => {
  const body = loginSchema.parse(request.body);
  const identifier = body.identifier.toLowerCase();
  const result = await pool.query('SELECT id,display_name,password_hash,is_active FROM users WHERE login_name=$1', [identifier]);
  const user = result.rows[0];
  if (!user || !user.is_active || !(await passwordVerify(body.password, user.password_hash))) {
    await transaction(db => audit(db, null, { action: 'LOGIN_FAILED', entityType: 'user', newValue: { identifier }, ip: clientIp(request), requestId: request.id }));
    throw new AppError(401, 'Invalid username or password.', 'INVALID_CREDENTIALS');
  }
  const token = createToken();
  const session = await pool.query(`INSERT INTO sessions(user_id,token_hash,ip,user_agent,expires_at) VALUES($1,$2,$3,$4,now()+interval '12 hours') RETURNING id`, [user.id, tokenHash(token), clientIp(request), request.headers['user-agent'] ?? null]);
  const actor = (await getActor({ ...request, cookies: { ...request.cookies, [sessionCookie]: token } } as FastifyRequest))!;
  await transaction(db => audit(db, actor, { action: 'LOGIN_SUCCEEDED', entityType: 'session', entityId: session.rows[0].id, ip: clientIp(request), requestId: request.id }));
  reply.setCookie(sessionCookie, token, sessionCookieOptions()).send({ user: { id: actor.id, loginName: actor.loginName, displayName: actor.displayName, roles: actor.roles, permissions: [...actor.permissions] } });
});

app.post('/api/v1/auth/logout', { preHandler: requirePermission('dashboard.read') }, async (request, reply) => {
  await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [request.actor!.sessionId]);
  await transaction(db => audit(db, request.actor, { action: 'LOGOUT', entityType: 'session', entityId: request.actor!.sessionId, ip: clientIp(request), requestId: request.id }));
  reply.clearCookie(sessionCookie, sessionCookieOptions()).status(204).send();
});

app.get('/api/v1/auth/me', { preHandler: requirePermission('dashboard.read') }, async request => ({
  user: { id: request.actor!.id, loginName: request.actor!.loginName, displayName: request.actor!.displayName, roles: request.actor!.roles, permissions: [...request.actor!.permissions] }
}));

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/healthz', async () => ({ status: 'ok' }));
app.get('/readyz', async () => { await pool.query('SELECT 1'); return { status: 'ready' }; });

// ── Dashboard ─────────────────────────────────────────────────────────────────
app.get('/api/v1/dashboard', { preHandler: requirePermission('dashboard.read') }, async () => {
  const { rows } = await pool.query(`SELECT COALESCE(sum(grand_total) FILTER (WHERE status='POSTED'),0) sales,COALESCE(sum(amount_paid) FILTER (WHERE status='POSTED'),0) collections,COALESCE(sum(amount_due) FILTER (WHERE status='POSTED'),0) outstanding,count(*) FILTER (WHERE status='POSTED') invoices FROM invoices WHERE created_at >= date_trunc('day',now())`);
  const stock = await pool.query(`SELECT count(*) low_stock FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE b.quantity <= v.reorder_threshold`);
  return { today: rows[0], lowStock: Number(stock.rows[0].low_stock) };
});

// ── Customers ─────────────────────────────────────────────────────────────────
const customerSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().regex(/^[0-9]{10}$/, 'Mobile number must be exactly 10 digits').optional(),
  email: z.string().email().optional(),
  address: z.string().max(1000).optional(),
});

app.get('/api/v1/customers', { preHandler: requirePermission('customers.read') }, async request => {
  const { q = '', limit = '50' } = request.query as { q?: string; limit?: string };
  const safe = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const result = await pool.query(
    `SELECT id, customer_code, full_name, phone, email, address, created_at
     FROM customers
     WHERE deleted_at IS NULL
       AND ($1='' OR full_name ILIKE '%'||$1||'%' OR phone ILIKE '%'||$1||'%' OR customer_code ILIKE '%'||$1||'%')
     ORDER BY full_name LIMIT $2`,
    [q.trim(), safe]
  );
  return { data: result.rows };
});

app.get('/api/v1/customers/:id', { preHandler: requirePermission('customers.read') }, async request => {
  const { id } = request.params as { id: string };
  const [cust, invoices] = await Promise.all([
    pool.query(`SELECT id,customer_code,full_name,phone,email,address,created_at FROM customers WHERE id=$1 AND deleted_at IS NULL`, [id]),
    pool.query(`SELECT i.id,i.invoice_number,i.grand_total,i.amount_paid,i.amount_due,i.payment_status,i.created_at, u.display_name AS cashier FROM invoices i JOIN users u ON u.id=i.cashier_id WHERE i.customer_id=$1 ORDER BY i.created_at DESC LIMIT 50`, [id]),
  ]);
  if (!cust.rows[0]) throw new AppError(404, 'Customer not found.', 'NOT_FOUND');
  return { data: { ...cust.rows[0], invoices: invoices.rows } };
});

app.post('/api/v1/customers', { preHandler: requirePermission('customers.write') }, async (request, reply) => {
  const input = customerSchema.parse(request.body);
  const result = await transaction(async db => {
    const code = `CUST-${Date.now()}`;
    const customer = await db.query(
      `INSERT INTO customers(organization_id, customer_code, full_name, phone, email, address)
       VALUES('11111111-0000-0000-0000-000000000001',$1,$2,$3,$4,$5)
       RETURNING id, customer_code, full_name, phone, email`,
      [code, input.fullName, input.phone ?? null, input.email ?? null, input.address ?? null]
    );
    await audit(db, request.actor, { action: 'CUSTOMER_CREATED', entityType: 'customer', entityId: customer.rows[0].id, newValue: customer.rows[0], ip: clientIp(request), requestId: request.id });
    return customer.rows[0];
  });
  return reply.status(201).send({ data: result });
});

app.patch('/api/v1/customers/:id', { preHandler: requirePermission('customers.write') }, async request => {
  const { id } = request.params as { id: string };
  const input = customerSchema.partial().parse(request.body);
  const existing = await pool.query('SELECT * FROM customers WHERE id=$1 AND deleted_at IS NULL', [id]);
  if (!existing.rows[0]) throw new AppError(404, 'Customer not found.', 'NOT_FOUND');
  const updated = await transaction(async db => {
    const r = await db.query(
      `UPDATE customers SET
         full_name=COALESCE($1,full_name),
         phone=COALESCE($2,phone),
         email=COALESCE($3,email),
         address=COALESCE($4,address),
         updated_at=now()
       WHERE id=$5 RETURNING id,customer_code,full_name,phone,email`,
      [input.fullName ?? null, input.phone ?? null, input.email ?? null, input.address ?? null, id]
    );
    await audit(db, request.actor, { action: 'CUSTOMER_UPDATED', entityType: 'customer', entityId: id, previousValue: existing.rows[0], newValue: input, ip: clientIp(request), requestId: request.id });
    return r.rows[0];
  });
  return { data: updated };
});

// ── Products ──────────────────────────────────────────────────────────────────
// Ensure every active product has a product_variants row for billing
async function ensureVariant(db: typeof pool, productId: string): Promise<string> {
  const existing = await db.query('SELECT id FROM product_variants WHERE product_id=$1 AND active=true LIMIT 1', [productId]);
  if (existing.rowCount) return existing.rows[0].id as string;
  const created = await db.query(
    `INSERT INTO product_variants(product_id, sku, selling_price, cost_price, reorder_threshold, active)
     SELECT id, sku, selling_price, cost_price, reorder_level, true FROM products WHERE id=$1
     RETURNING id`,
    [productId]
  );
  return created.rows[0].id as string;
}

app.get('/api/v1/products', { preHandler: requirePermission('products.read') }, async request => {
  const { q = '', limit = '50' } = request.query as { q?: string; limit?: string };
  // Ensure all products have variants (auto-create missing ones)
  const allProducts = await pool.query(`SELECT id FROM products WHERE is_active=true`);
  for (const p of allProducts.rows) { await ensureVariant(pool, p.id); }
  // Return variant.id as the product ID so invoice-service can find it
  const result = await pool.query(
    `SELECT v.id, p.id AS product_id, p.sku, p.barcode, p.product_name AS name,
            p.color, p.size, p.selling_price, p.cost_price, p.tax_rate,
            p.reorder_level AS reorder_threshold,
            COALESCE(sum(b.quantity),0)::int stock
     FROM products p
     JOIN product_variants v ON v.product_id=p.id AND v.active=true
     LEFT JOIN inventory_balances b ON b.variant_id=v.id
     WHERE p.is_active
       AND ($1='' OR p.sku ILIKE '%'||$1||'%' OR p.barcode=$1 OR p.product_name ILIKE '%'||$1||'%')
     GROUP BY v.id, p.id
     ORDER BY p.product_name
     LIMIT $2`,
    [q.trim(), Math.min(Math.max(Number(limit) || 50, 1), 100)]
  );
  return { data: result.rows };
});

app.get('/api/v1/locations', { preHandler: requirePermission('inventory.read') }, async () => ({
  data: (await pool.query('SELECT id,code,name FROM locations WHERE active ORDER BY name')).rows
}));

// ── Inventory ─────────────────────────────────────────────────────────────────
app.get('/api/v1/inventory', { preHandler: requirePermission('inventory.read') }, async request => {
  const { q = '', location = '' } = request.query as { q?: string; location?: string };
  const result = await pool.query(
    `SELECT
       p.id AS product_id,
       p.product_name AS name,
       p.sku,
       p.color,
       p.size,
       p.product_type AS type,
       p.selling_price,
       p.cost_price,
       p.tax_rate,
       p.reorder_level,
       p.created_at,
       COALESCE(SUM(b.quantity),0)::int AS total_stock,
       COALESCE(SUM(b.quantity),0)::int AS available,
       0 AS reserved,
       0 AS damaged,
       COALESCE(SUM(b.quantity),0) * NULLIF(COALESCE(p.cost_price,0),0) AS stock_value,
       json_agg(json_build_object(
         'store_id',   l.id,
         'store_name', l.name,
         'quantity',   b.quantity
       )) FILTER (WHERE l.id IS NOT NULL) AS locations
     FROM products p
     LEFT JOIN product_variants v ON v.product_id=p.id AND v.active=true
     LEFT JOIN inventory_balances b ON b.variant_id=v.id
     LEFT JOIN locations l ON l.id=b.location_id
     WHERE p.is_active
       AND ($1='' OR p.product_name ILIKE '%'||$1||'%' OR p.sku ILIKE '%'||$1||'%')
       AND ($2='' OR b.location_id::text=$2)
     GROUP BY p.id
     ORDER BY p.product_name
     LIMIT 200`,
    [q.trim(), location.trim()]
  );
  return { data: result.rows };
});

app.get('/api/v1/inventory/stores', { preHandler: requirePermission('inventory.read') }, async () => ({
  data: (await pool.query('SELECT id,code,name FROM locations WHERE active ORDER BY name')).rows
}));

// Add Product — uses original products+product_variants schema
const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  productType: z.enum(['FRAME','LENS','CONTACT_LENS','ACCESSORY','SERVICE','OTHER']).default('FRAME'),
  sellingPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  costPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  color: z.string().max(80).optional(),
  size: z.string().max(40).optional(),
  reorderLevel: z.number().int().min(0).default(5),
});

app.post('/api/v1/inventory/products', { preHandler: requirePermission('products.write') }, async (request, reply) => {
  const input = productSchema.parse(request.body);
  const result = await transaction(async db => {
    const sku = `PRD-${Date.now()}`;
    const product = await db.query(
      `INSERT INTO products(organization_id, sku, product_type, product_name, selling_price, cost_price, color, size, reorder_level, is_active)
       VALUES('11111111-0000-0000-0000-000000000001',$1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id, sku, product_name`,
      [sku, input.productType, input.name, input.sellingPrice, input.costPrice ?? '0',
       input.color ?? null, input.size ?? null, input.reorderLevel]
    );
    await audit(db, request.actor, { action: 'PRODUCT_CREATED', entityType: 'product', entityId: product.rows[0].id, newValue: { name: input.name, sku }, ip: clientIp(request), requestId: request.id });
    return { id: product.rows[0].id, sku: product.rows[0].sku, name: product.rows[0].product_name };
  });
  return reply.status(201).send({ data: result });
});

// Delete Product — admin only; employee attempt is logged
app.delete('/api/v1/inventory/products/:id', { preHandler: requirePermission('products.read') }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const actor = request.actor!;
  if (!isAdmin(actor)) {
    await transaction(db => audit(db, actor, { action: 'PRODUCT_DELETE_DENIED', entityType: 'product', entityId: id, newValue: { attemptedBy: actor.loginName, roles: actor.roles }, ip: clientIp(request), requestId: request.id }));
    throw new AppError(403, 'Only admin can delete products. This attempt has been logged.', 'FORBIDDEN');
  }
  await transaction(async db => {
    const r = await db.query('UPDATE products SET is_active=false WHERE id=$1 RETURNING id,sku,product_name', [id]);
    if (!r.rowCount) throw new AppError(404, 'Product not found.', 'NOT_FOUND');
    await audit(db, actor, { action: 'PRODUCT_DELETED', entityType: 'product', entityId: id, newValue: { sku: r.rows[0].sku, name: r.rows[0].product_name }, ip: clientIp(request), requestId: request.id });
  });
  return reply.status(204).send();
});

// Add Stock — uses inventory_balances + locations (correct schema)
const stockReceiptSchema = z.object({
  variantId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().int().positive().max(100000),
  reason: z.string().trim().default('Stock received'),
});

app.post('/api/v1/inventory/stock', { preHandler: requirePermission('inventory.adjust') }, async (request, reply) => {
  const input = stockReceiptSchema.parse(request.body);
  const result = await transaction(async db => {
    // In this schema, products are created without variants.
    // We auto-create a product_variant for inventory tracking if one doesn't exist.
    const product = await db.query('SELECT id,sku,product_name FROM products WHERE id=$1 AND is_active FOR UPDATE', [input.variantId]);
    if (!product.rowCount) throw new AppError(404, 'Product not found.', 'NOT_FOUND');
    const location = await db.query('SELECT id,name FROM locations WHERE id=$1 AND active', [input.locationId]);
    if (!location.rowCount) throw new AppError(404, 'Location not found.', 'NOT_FOUND');

    // Get or create a product_variant for this product
    let variantRow = await db.query('SELECT id FROM product_variants WHERE product_id=$1 LIMIT 1', [input.variantId]);
    if (!variantRow.rowCount) {
      variantRow = await db.query(
        `INSERT INTO product_variants(product_id, sku, selling_price, cost_price, reorder_threshold, active)
         SELECT id, sku, selling_price, cost_price, reorder_level, true FROM products WHERE id=$1
         RETURNING id`,
        [input.variantId]
      );
    }
    const variantId = variantRow.rows[0].id;

    await db.query('INSERT INTO inventory_balances(variant_id,location_id,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING', [variantId, input.locationId]);
    const bal = await db.query('SELECT quantity FROM inventory_balances WHERE variant_id=$1 AND location_id=$2 FOR UPDATE', [variantId, input.locationId]);
    const before = Number(bal.rows[0].quantity);
    const after = before + input.quantity;
    await db.query('UPDATE inventory_balances SET quantity=$1,updated_at=now() WHERE variant_id=$2 AND location_id=$3', [after, variantId, input.locationId]);
    const movement = await db.query(
      `INSERT INTO inventory_movements(variant_id,location_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reason,performed_by)
       VALUES($1,$2,'STOCK_RECEIPT',$3,$4,$5,'MANUAL_RECEIPT',$6,$7) RETURNING id`,
      [variantId, input.locationId, input.quantity, before, after, input.reason, request.actor!.id]
    );
    await audit(db, request.actor, { action: 'STOCK_RECEIVED', entityType: 'inventory_movement', entityId: movement.rows[0].id, newValue: { sku: product.rows[0].sku, location: location.rows[0].name, qty: input.quantity, before, after }, reason: input.reason, ip: clientIp(request), requestId: request.id });
    return { productId: input.variantId, locationId: input.locationId, sku: product.rows[0].sku, before, after };
  });
  return reply.status(201).send({ data: result });
});

// ── Invoices ──────────────────────────────────────────────────────────────────
const saleSchema = z.object({
  customerId: z.string().uuid().optional(),
  locationId: z.string().uuid(),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().positive().max(1000), discount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional() })).min(1).max(100),
  payments: z.array(z.object({ amount: z.string().regex(/^\d+(\.\d{1,2})?$/), method: z.enum(['CASH','UPI','CARD','BANK_TRANSFER','OTHER']), reference: z.string().max(200).optional() })).max(10),
});

app.post('/api/v1/invoices', { preHandler: requirePermission('invoices.create') }, async (request, reply) => {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 200) throw new AppError(400, 'A 16–200 character Idempotency-Key header is required.', 'IDEMPOTENCY_KEY_REQUIRED');
  const input = saleSchema.parse(request.body) as SaleInput;
  const output = await transaction(db => postSale(db, request.actor!, input, key, { ip: clientIp(request), requestId: request.id }));
  return reply.status(201).send({ data: output });
});

// ── Reports (admin only) ──────────────────────────────────────────────────────
app.get('/api/v1/reports/sales', { preHandler: requirePermission('audit.read') }, async request => {
  const { period = 'day', employeeId = '' } = request.query as { period?: string; employeeId?: string };
  const interval = period === 'week' ? '7 days' : period === 'month' ? '30 days' : '1 day';
  const result = await pool.query(
    `SELECT
       u.id AS employee_id,
       u.display_name AS employee,
       COUNT(i.id)::int AS invoice_count,
       COALESCE(SUM(i.grand_total),0) AS total_sales,
       COALESCE(SUM(i.amount_paid),0) AS total_collected,
       COALESCE(SUM(i.amount_due),0) AS total_outstanding
     FROM invoices i
     JOIN users u ON u.id=i.cashier_id
     WHERE i.status='POSTED'
       AND i.created_at >= now() - $1::interval
       AND ($2='' OR i.cashier_id::text=$2)
     GROUP BY u.id,u.display_name
     ORDER BY total_sales DESC`,
    [interval, employeeId]
  );
  return { data: result.rows, period };
});

app.get('/api/v1/reports/invoices', { preHandler: requirePermission('audit.read') }, async request => {
  const { period = 'day', employeeId = '' } = request.query as { period?: string; employeeId?: string };
  const interval = period === 'week' ? '7 days' : period === 'month' ? '30 days' : '1 day';
  const result = await pool.query(
    `SELECT
       i.id, i.invoice_number, i.grand_total, i.amount_paid, i.amount_due,
       i.payment_status, i.created_at,
       u.display_name AS cashier,
       c.full_name AS customer_name,
       c.phone AS customer_mobile
     FROM invoices i
     JOIN users u ON u.id=i.cashier_id
     LEFT JOIN customers c ON c.id=i.customer_id
     WHERE i.status='POSTED'
       AND i.created_at >= now() - $1::interval
       AND ($2='' OR i.cashier_id::text=$2)
     ORDER BY i.created_at DESC
     LIMIT 200`,
    [interval, employeeId]
  );
  return { data: result.rows, period };
});

app.get('/api/v1/reports/stock-movements', { preHandler: requirePermission('audit.read') }, async request => {
  const { period = 'day' } = request.query as { period?: string };
  const interval = period === 'week' ? '7 days' : period === 'month' ? '30 days' : '1 day';
  const result = await pool.query(
    `SELECT
       m.id, m.movement_type, m.quantity_delta, m.quantity_before, m.quantity_after,
       m.reason, m.created_at,
       p.sku, p.product_name AS product_name,
       l.name AS location_name,
       u.display_name AS performed_by
     FROM inventory_movements m
     JOIN products p ON p.id=m.variant_id
     JOIN locations l ON l.id=m.location_id
     LEFT JOIN users u ON u.id=m.performed_by
     WHERE m.created_at >= now() - $1::interval
     ORDER BY m.created_at DESC
     LIMIT 200`,
    [interval]
  );
  return { data: result.rows, period };
});

app.get('/api/v1/reports/employees', { preHandler: requirePermission('audit.read') }, async () => {
  const result = await pool.query(
    `SELECT u.id, u.display_name, u.login_name, array_agg(DISTINCT r.code) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id=u.id
     LEFT JOIN roles r ON r.id=ur.role_id
     WHERE u.is_active GROUP BY u.id ORDER BY u.display_name`
  );
  return { data: result.rows };
});

// ── Audit ─────────────────────────────────────────────────────────────────────
app.get('/api/v1/audit', { preHandler: requirePermission('audit.read') }, async request => {
  const { limit = '100', action = '', entityType = '' } = request.query as { limit?: string; action?: string; entityType?: string };
  const result = await pool.query(
    `SELECT id,occurred_at,actor_login,actor_roles,action,entity_type,entity_id,new_value,reason
     FROM audit_logs
     WHERE ($1='' OR action ILIKE $1) AND ($2='' OR entity_type=$2)
     ORDER BY occurred_at DESC LIMIT $3`,
    [action ? `%${action}%` : '', entityType, Math.min(Math.max(Number(limit) || 100, 1), 500)]
  );
  return { data: result.rows };
});

app.get('/api/v1/audit/verify', { preHandler: requirePermission('audit.read') }, async () => {
  const { rows } = await pool.query(`SELECT canonical_payload,previous_hash,event_hash FROM audit_logs ORDER BY sequence_no`);
  let prior = '0'.repeat(64);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.previous_hash !== prior || createHash('sha256').update(prior + row.canonical_payload).digest('hex') !== row.event_hash)
      return { valid: false, failedAt: i + 1 };
    prior = row.event_hash;
  }
  const head = await pool.query(`SELECT last_hash FROM audit_chain_heads WHERE scope='global'`);
  return { valid: head.rows[0]?.last_hash === prior, entries: rows.length };
});

export { app };

if (!process.env.VERCEL) await app.listen({ port: config.PORT, host: '0.0.0.0' });
