import { pool } from '../src/lib/db.js';
const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='document_sequences' ORDER BY ordinal_position`);
console.log('document_sequences columns:', r.rows.map((x: any) => x.column_name).join(', '));
const s = await pool.query(`SELECT * FROM document_sequences LIMIT 5`);
console.log('rows:', JSON.stringify(s.rows, null, 2));
await pool.end();
