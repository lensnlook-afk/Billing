import { pool } from '../src/lib/db.js';
for (const t of ['invoice_items', 'invoices', 'idempotency_keys']) {
  const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='${t}' ORDER BY ordinal_position`);
  console.log(`${t}:`, r.rows.map((x: any) => x.column_name).join(', '));
}
await pool.end();
