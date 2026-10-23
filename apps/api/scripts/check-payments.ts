import { pool } from '../src/lib/db.js';
const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='payments' ORDER BY ordinal_position`);
console.log('payments:', r.rows.map((x: any) => x.column_name).join(', '));
await pool.end();
