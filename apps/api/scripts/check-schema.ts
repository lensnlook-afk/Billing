import { pool } from '../src/lib/db.js';
const r = await pool.query(`SELECT p.id as product_id, p.product_name, v.id as variant_id, v.sku FROM products p LEFT JOIN product_variants v ON v.product_id = p.id LIMIT 10`);
console.log('products+variants:', JSON.stringify(r.rows, null, 2));
const b = await pool.query(`SELECT * FROM inventory_balances LIMIT 5`);
console.log('inventory_balances:', JSON.stringify(b.rows, null, 2));
await pool.end();
