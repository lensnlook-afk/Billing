import { pool } from '../src/lib/db.js';
const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='products' ORDER BY ordinal_position`);
console.log('products:', r.rows.map((x: any) => x.column_name).join(', '));
const v = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='product_variants' ORDER BY ordinal_position`);
console.log('product_variants:', v.rows.map((x: any) => x.column_name).join(', '));
const i = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='invoices' ORDER BY ordinal_position`);
console.log('invoices:', i.rows.map((x: any) => x.column_name).join(', '));
await pool.end();
