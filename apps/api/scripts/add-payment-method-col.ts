import { pool } from '../src/lib/db.js';
await pool.query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method text');
console.log('Done: payment_method column added to invoices');
await pool.end();
