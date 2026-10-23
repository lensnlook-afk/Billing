import { pool } from '../src/lib/db.js';
const r = await pool.query(`SELECT id, code, name FROM locations WHERE active ORDER BY name`);
console.log('locations:', JSON.stringify(r.rows, null, 2));
const d = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='document_sequences' ORDER BY ordinal_position`);
console.log('doc_seq cols:', d.rows.map((x: any) => x.column_name).join(', '));
await pool.end();
