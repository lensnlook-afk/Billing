/**
 * One-time production setup script.
 * Run: tsx --env-file=../../.env scripts/setup-prod.ts
 */
import { pool } from '../src/lib/db.js';

// 1. Grant inventory.adjust to CASHIER so employees can add stock
await pool.query(`
  INSERT INTO role_permissions(role_id, permission_id)
  SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
  WHERE r.code='CASHIER' AND p.code='inventory.adjust'
  ON CONFLICT DO NOTHING
`);
console.log('✓ CASHIER: inventory.adjust granted');

// 2. Grant customers.write to CASHIER so employees can create customers
await pool.query(`
  INSERT INTO role_permissions(role_id, permission_id)
  SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
  WHERE r.code='CASHIER' AND p.code='customers.write'
  ON CONFLICT DO NOTHING
`);
console.log('✓ CASHIER: customers.write granted');

// 3. Ensure audit_logs_legacy view exists (API uses this name)
const auditExists = await pool.query(`SELECT to_regclass('public.audit_logs_legacy') AS exists`);
if (!auditExists.rows[0].exists) {
  await pool.query(`CREATE OR REPLACE VIEW audit_logs_legacy AS SELECT * FROM audit_logs`);
  console.log('✓ audit_logs_legacy view created');
} else {
  console.log('✓ audit_logs_legacy already exists');
}

// 4. Ensure customers_legacy view exists
const custExists = await pool.query(`SELECT to_regclass('public.customers_legacy') AS exists`);
if (!custExists.rows[0].exists) {
  await pool.query(`CREATE OR REPLACE VIEW customers_legacy AS SELECT * FROM customers`);
  console.log('✓ customers_legacy view created');
} else {
  console.log('✓ customers_legacy already exists');
}

await pool.end();
console.log('\nDone.');
