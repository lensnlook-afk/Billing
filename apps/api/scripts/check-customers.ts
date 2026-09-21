import { pool } from '../src/lib/db.js';
const r = await pool.query(`SELECT customer_code, full_name FROM customers LIMIT 5`);
console.log(r.rows);
// Check max code to understand format
const m = await pool.query(`SELECT customer_code FROM customers ORDER BY created_at DESC LIMIT 1`);
console.log('latest code:', m.rows[0]);
await pool.end();
