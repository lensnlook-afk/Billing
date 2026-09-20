import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import Fastify, { type FastifyRequest } from 'fastify'; import cookie from '@fastify/cookie'; import cors from '@fastify/cors'; import helmet from '@fastify/helmet'; import { z } from 'zod';
import { pool, transaction } from './lib/db.js'; import { config } from './lib/config.js'; import { AppError } from './lib/errors.js'; import { clientIp, createToken, getActor, passwordVerify, sessionCookie, sessionCookieOptions, tokenHash, type Actor } from './lib/auth.js'; import { audit } from './lib/audit.js'; import { postSale, type SaleInput } from './services/invoice-service.js';

declare module 'fastify' { interface FastifyRequest { actor: Actor | null; } }
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, requestIdHeader: 'x-request-id', genReqId: () => randomUUID() });
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cookie);
// In development we allow any origin (the frontend runs on localhost:5173)
// and we need to send cookies, so `origin: true` reflects the incoming Origin header.
// Build allowed-origin list: always include localhost dev origins plus WEB_ORIGIN.
// On Vercel, WEB_ORIGIN is set to the production frontend URL.
// We also accept any *.vercel.app preview URL so branch/preview deploys work.
function isAllowedOrigin(origin: string): boolean {
  if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return true;
  if (origin === config.WEB_ORIGIN) return true;
  // Allow Vercel preview URLs for the same team (billing-*-lensnlook.vercel.app)
  if (/^https:\/\/billing-[^.]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'), false);
  },
  credentials: true,
});
app.addHook('onRequest', async (request, reply) => {
  reply.header('x-request-id', request.id);
  const origin = request.headers.origin;
  if (['POST','PUT','PATCH','DELETE'].includes(request.method) && origin && !isAllowedOrigin(origin)) {
    throw new AppError(403,'Cross-origin request denied.','ORIGIN_DENIED');
  }
  request.actor = await getActor(request);
});
app.setErrorHandler((error, request, reply) => { const isZodError = error instanceof z.ZodError; const status = error instanceof AppError ? error.statusCode : isZodError ? 422 : 500; request.log.error({ err:error, requestId:request.id }, 'request failed'); reply.status(status).send({ error: { code: error instanceof AppError ? error.code : isZodError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR', message: status === 500 ? 'An unexpected error occurred.' : error instanceof Error ? error.message : 'Request failed.', requestId: request.id } }); });

function requirePermission(permission: string) { return async (request: FastifyRequest) => { if (!request.actor) throw new AppError(401,'Sign in is required.','UNAUTHENTICATED'); if (!request.actor.permissions.has(permission)) throw new AppError(403,'You do not have permission for this action.','FORBIDDEN'); }; }
const loginSchema = z.object({ identifier:z.string().trim().min(2).max(80), password:z.string().min(1).max(256) });
app.post('/api/v1/auth/login', async (request, reply) => { const body=loginSchema.parse(request.body); const identifier=body.identifier.toLowerCase(); const result=await pool.query('SELECT id,display_name,password_hash,is_active FROM users WHERE login_name=$1',[identifier]); const user=result.rows[0]; if (!user || !user.is_active || !(await passwordVerify(body.password,user.password_hash))) { await transaction(db=>audit(db,null,{action:'LOGIN_FAILED',entityType:'user',newValue:{identifier},ip:clientIp(request),requestId:request.id})); throw new AppError(401,'Invalid username or password.','INVALID_CREDENTIALS'); } const token=createToken(); const session=await pool.query(`INSERT INTO sessions(user_id,token_hash,ip,user_agent,expires_at) VALUES($1,$2,$3,$4,now()+interval '12 hours') RETURNING id`,[user.id,tokenHash(token),clientIp(request),request.headers['user-agent'] ?? null]); const actor=(await getActor({ ...request, cookies:{...request.cookies,[sessionCookie]:token} } as FastifyRequest))!; await transaction(db=>audit(db,actor,{action:'LOGIN_SUCCEEDED',entityType:'session',entityId:session.rows[0].id,ip:clientIp(request),requestId:request.id})); reply.setCookie(sessionCookie,token,sessionCookieOptions()).send({ user:{ id:actor.id,loginName:actor.loginName,displayName:actor.displayName,roles:actor.roles,permissions:[...actor.permissions] } }); });
app.post('/api/v1/auth/logout', { preHandler: requirePermission('dashboard.read') }, async (request,reply) => { await pool.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[request.actor!.sessionId]); await transaction(db=>audit(db,request.actor,{action:'LOGOUT',entityType:'session',entityId:request.actor!.sessionId,ip:clientIp(request),requestId:request.id})); reply.clearCookie(sessionCookie,sessionCookieOptions()).status(204).send(); });
app.get('/api/v1/auth/me', { preHandler: requirePermission('dashboard.read') }, async request => ({ user:{id:request.actor!.id,loginName:request.actor!.loginName,displayName:request.actor!.displayName,roles:request.actor!.roles,permissions:[...request.actor!.permissions]} }));

app.get('/healthz', async () => ({ status:'ok' })); app.get('/readyz', async () => { await pool.query('SELECT 1'); return {status:'ready'}; });
app.get('/api/v1/dashboard', { preHandler: requirePermission('dashboard.read') }, async () => { const { rows }=await pool.query(`SELECT COALESCE(sum(grand_total) FILTER (WHERE status='POSTED'),0) sales,COALESCE(sum(amount_paid) FILTER (WHERE status='POSTED'),0) collections,COALESCE(sum(amount_due) FILTER (WHERE status='POSTED'),0) outstanding,count(*) FILTER (WHERE status='POSTED') invoices FROM invoices WHERE created_at >= date_trunc('day',now())`); const stock=await pool.query(`SELECT count(*) low_stock FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE b.quantity <= v.reorder_threshold`); return { today:rows[0],lowStock:Number(stock.rows[0].low_stock) }; });
const customerSchema=z.object({name:z.string().trim().min(2).max(160),mobile:z.string().trim().regex(/^[0-9+ -]{7,20}$/).optional(),email:z.string().email().optional(),address:z.string().max(1000).optional(),notes:z.string().max(2000).optional()});
app.get('/api/v1/customers',{preHandler:requirePermission('customers.read')},async request=>{const {q='',limit='20'}=request.query as {q?:string;limit?:string}; const safe=Math.min(Math.max(Number(limit)||20,1),100); const result=await pool.query(`SELECT id,customer_no,name,mobile,email FROM customers_legacy WHERE archived_at IS NULL AND ($1='' OR name ILIKE '%' || $1 || '%' OR mobile ILIKE '%' || $1 || '%' OR customer_no::text=$1) ORDER BY name LIMIT $2`,[q.trim(),safe]); return {data:result.rows};});
app.post('/api/v1/customers',{preHandler:requirePermission('customers.write')},async(request,reply)=>{const input=customerSchema.parse(request.body); const result=await transaction(async db=>{const customer=await db.query(`INSERT INTO customers_legacy(name,mobile,email,address,notes) VALUES($1,$2,$3,$4,$5) RETURNING id,customer_no,name,mobile,email`,[input.name,input.mobile ?? null,input.email ?? null,input.address ?? null,input.notes ?? null]); await audit(db,request.actor,{action:'CUSTOMER_CREATED',entityType:'customer',entityId:customer.rows[0].id,newValue:customer.rows[0],ip:clientIp(request),requestId:request.id}); return customer.rows[0];}); return reply.status(201).send({data:result});});
app.get('/api/v1/products',{preHandler:requirePermission('products.read')},async request=>{const {q='',limit='50'}=request.query as {q?:string;limit?:string};const result=await pool.query(`SELECT v.id,v.sku,v.barcode,v.variant,v.size,v.color,v.selling_price,v.mrp,v.reorder_threshold,p.product_name as name,p.tax_rate,COALESCE(sum(b.quantity),0)::int stock FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN inventory_balances b ON b.variant_id=v.id WHERE v.active AND p.is_active AND ($1='' OR v.sku ILIKE '%' || $1 || '%' OR v.barcode=$1 OR p.product_name ILIKE '%' || $1 || '%') GROUP BY v.id,p.id ORDER BY p.product_name LIMIT $2`,[q.trim(),Math.min(Math.max(Number(limit)||50,1),100)]);return {data:result.rows};});
app.get('/api/v1/locations',{preHandler:requirePermission('inventory.read')},async()=>({data:(await pool.query('SELECT id,code,name FROM locations WHERE active ORDER BY name')).rows}));

app.get('/api/v1/inventory',{preHandler:requirePermission('inventory.read')},async request=>{
  const {q='',location=''}=request.query as {q?:string;location?:string};
  const result=await pool.query(`
    SELECT
      p.id            AS product_id,
      p.product_name  AS name,
      p.sku,
      p.product_type  AS type,
      p.selling_price,
      p.cost_price,
      p.tax_rate,
      p.reorder_level,
      COALESCE(SUM(si.quantity),0)::int           AS total_stock,
      COALESCE(SUM(si.available_quantity),0)::int AS available,
      COALESCE(SUM(si.reserved_quantity),0)::int  AS reserved,
      COALESCE(SUM(si.damaged_quantity),0)::int   AS damaged,
      json_agg(json_build_object(
        'store_id',   l.id,
        'store_name', l.store_name,
        'quantity',   si.quantity,
        'available',  si.available_quantity
      )) FILTER (WHERE l.id IS NOT NULL) AS locations
    FROM products p
    LEFT JOIN store_inventory si ON si.product_id = p.id
    LEFT JOIN stores l ON l.id = si.store_id
    WHERE p.is_active
      AND ($1='' OR p.product_name ILIKE '%'||$1||'%' OR p.sku ILIKE '%'||$1||'%')
      AND ($2='' OR si.store_id::text=$2)
    GROUP BY p.id
    ORDER BY p.product_name
    LIMIT 200
  `,[q.trim(), location.trim()]);
  return {data:result.rows};
});

app.get('/api/v1/inventory/stores',{preHandler:requirePermission('inventory.read')},async()=>({data:(await pool.query('SELECT id,store_code AS code,store_name AS name FROM stores WHERE is_active ORDER BY store_name')).rows}));
const productSchema=z.object({name:z.string().trim().min(2).max(200),sku:z.string().trim().min(2).max(80),barcode:z.string().trim().max(100).optional(),sellingPrice:z.string().regex(/^\d+(\.\d{1,2})?$/),costPrice:z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),mrp:z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),taxRate:z.string().regex(/^\d+(\.\d{1,2})?$/).default('0.00'),productType:z.enum(['FRAME','LENS','CONTACT_LENS','ACCESSORY','SERVICE','OTHER']).default('FRAME'),color:z.string().max(80).optional(),size:z.string().max(40).optional(),reorderLevel:z.number().int().min(0).default(5)});
app.post('/api/v1/inventory/products',{preHandler:requirePermission('products.write')},async(request,reply)=>{
  const input=productSchema.parse(request.body);
  const orgId='11111111-0000-0000-0000-000000000001';
  const result=await transaction(async db=>{
    const product=await db.query(
      `INSERT INTO products(organization_id,sku,barcode,product_type,product_name,selling_price,cost_price,tax_rate,color,size,reorder_level)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,sku,product_name`,
      [orgId,input.sku,input.barcode??null,input.productType,input.name,
       input.sellingPrice,input.costPrice??'0',input.taxRate,
       input.color??null,input.size??null,input.reorderLevel]
    );
    await audit(db,request.actor,{action:'PRODUCT_CREATED',entityType:'product',entityId:product.rows[0].id,newValue:product.rows[0],ip:clientIp(request),requestId:request.id});
    return product.rows[0];
  });
  return reply.status(201).send({data:result});
});
const stockReceiptSchema=z.object({variantId:z.string().uuid(),locationId:z.string().uuid(),quantity:z.number().int().positive().max(100000),reason:z.string().trim().min(4).max(500)});
app.post('/api/v1/inventory/receipts',{preHandler:requirePermission('inventory.adjust')},async(request,reply)=>{const input=stockReceiptSchema.parse(request.body);const result=await transaction(async db=>{const variant=await db.query('SELECT id,sku FROM product_variants WHERE id=$1 AND active FOR UPDATE',[input.variantId]);if(!variant.rowCount)throw new AppError(404,'Product variant was not found.','PRODUCT_NOT_FOUND');const location=await db.query('SELECT id FROM locations WHERE id=$1 AND active',[input.locationId]);if(!location.rowCount)throw new AppError(404,'Stock location was not found.','LOCATION_NOT_FOUND');await db.query('INSERT INTO inventory_balances(variant_id,location_id,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[input.variantId,input.locationId]);const balance=await db.query('SELECT quantity FROM inventory_balances WHERE variant_id=$1 AND location_id=$2 FOR UPDATE',[input.variantId,input.locationId]);const before=balance.rows[0].quantity as number;const after=before+input.quantity;await db.query('UPDATE inventory_balances SET quantity=$1,updated_at=now() WHERE variant_id=$2 AND location_id=$3',[after,input.variantId,input.locationId]);const movement=await db.query(`INSERT INTO inventory_movements(variant_id,location_id,movement_type,quantity_delta,quantity_before,quantity_after,reference_type,reason,performed_by) VALUES($1,$2,'STOCK_RECEIPT',$3,$4,$5,'MANUAL_RECEIPT',$6,$7) RETURNING id`,[input.variantId,input.locationId,input.quantity,before,after,input.reason,request.actor!.id]);await audit(db,request.actor,{action:'STOCK_RECEIVED',entityType:'inventory_movement',entityId:movement.rows[0].id,newValue:{variantId:input.variantId,locationId:input.locationId,quantity:input.quantity,before,after},reason:input.reason,transactionId:movement.rows[0].id,ip:clientIp(request),requestId:request.id});return {movementId:movement.rows[0].id,before,after};});return reply.status(201).send({data:result});});

const stockAddSchema=z.object({productId:z.string().uuid(),storeId:z.string().uuid(),quantity:z.number().int().positive().max(100000),reason:z.string().trim().min(4).max(500)});
app.post('/api/v1/inventory/stock',{preHandler:requirePermission('inventory.adjust')},async(request,reply)=>{
  const input=stockAddSchema.parse(request.body);
  const result=await transaction(async db=>{
    const product=await db.query('SELECT id,product_name,sku FROM products WHERE id=$1 AND is_active FOR UPDATE',[input.productId]);
    if(!product.rowCount) throw new AppError(404,'Product not found.','PRODUCT_NOT_FOUND');
    const store=await db.query('SELECT id FROM stores WHERE id=$1 AND is_active',[input.storeId]);
    if(!store.rowCount) throw new AppError(404,'Store not found.','STORE_NOT_FOUND');
    await db.query('INSERT INTO store_inventory(store_id,product_id,quantity) VALUES($1,$2,0) ON CONFLICT(store_id,product_id) DO NOTHING',[input.storeId,input.productId]);
    const bal=await db.query('SELECT quantity FROM store_inventory WHERE store_id=$1 AND product_id=$2 FOR UPDATE',[input.storeId,input.productId]);
    const before=Number(bal.rows[0].quantity);
    const after=before+input.quantity;
    await db.query('UPDATE store_inventory SET quantity=$1,updated_at=now() WHERE store_id=$2 AND product_id=$3',[after,input.storeId,input.productId]);
    await audit(db,request.actor,{action:'STOCK_RECEIVED',entityType:'store_inventory',entityId:input.productId,newValue:{productId:input.productId,storeId:input.storeId,qty:input.quantity,before,after},reason:input.reason,ip:clientIp(request),requestId:request.id});
    return {productId:input.productId,storeId:input.storeId,before,after};
  });
  return reply.status(201).send({data:result});
});
const saleSchema=z.object({customerId:z.string().uuid().optional(),locationId:z.string().uuid(),items:z.array(z.object({variantId:z.string().uuid(),quantity:z.number().int().positive().max(1000),discount:z.string().regex(/^\d+(\.\d{1,2})?$/).optional()})).min(1).max(100),payments:z.array(z.object({amount:z.string().regex(/^\d+(\.\d{1,2})?$/),method:z.enum(['CASH','UPI','CARD','BANK_TRANSFER','OTHER']),reference:z.string().max(200).optional()})).max(10)});
app.post('/api/v1/invoices',{preHandler:requirePermission('invoices.create')},async(request,reply)=>{const key=request.headers['idempotency-key'];if(typeof key!=='string'||key.length<16||key.length>200)throw new AppError(400,'A 16–200 character Idempotency-Key header is required.','IDEMPOTENCY_KEY_REQUIRED');const input=saleSchema.parse(request.body) as SaleInput;const output=await transaction(db=>postSale(db,request.actor!,input,key,{ip:clientIp(request),requestId:request.id}));return reply.status(201).send({data:output});});
app.get('/api/v1/audit',{preHandler:requirePermission('audit.read')},async request=>{const {limit='50'}=request.query as {limit?:string};const result=await pool.query(`SELECT id,occurred_at,actor_login,actor_roles,action,entity_type,entity_id,reason,previous_hash,event_hash FROM audit_logs_legacy ORDER BY occurred_at DESC LIMIT $1`,[Math.min(Math.max(Number(limit)||50,1),200)]);return {data:result.rows};});
app.get('/api/v1/audit/verify',{preHandler:requirePermission('audit.read')},async()=>{const {rows}=await pool.query(`SELECT canonical_payload,previous_hash,event_hash FROM audit_logs_legacy ORDER BY sequence_no`);let prior='0'.repeat(64);for(let index=0;index<rows.length;index++){const row=rows[index];if(row.previous_hash!==prior||createHash('sha256').update(prior+row.canonical_payload).digest('hex')!==row.event_hash)return {valid:false,failedAt:index+1};prior=row.event_hash}const head=await pool.query(`SELECT last_hash FROM audit_chain_heads WHERE scope='global'`);return {valid:head.rows[0]?.last_hash===prior,entries:rows.length};});
export { app };

// Vercel imports the Fastify instance through api/[...path].ts. Local and
// container deployments retain the conventional standalone HTTP listener.
if (!process.env.VERCEL) await app.listen({port:config.PORT,host:'0.0.0.0'});
