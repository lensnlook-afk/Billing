/**
 * Reset the invoice sequence so the next invoice number starts at 001.
 *
 * The Node invoice service uses a `document_sequences` table keyed by
 * (organization_id, prefix, year) with a `last_value` counter that is
 * atomically incremented on every sale.  Setting `last_value` back to 0
 * makes the next posted invoice carry suffix `-001`.
 *
 * This only affects FUTURE invoices — existing invoices keep their
 * already-issued numbers.  Run when no sale is in flight.
 *
 * Usage:  npx tsx scripts/reset-invoice-sequence.ts
 */
import { pool } from '../src/lib/db.js';

const ORG_ID = '11111111-0000-0000-0000-000000000001';
const PREFIX = 'INV';
const YEAR = new Date().getUTCFullYear();

// Show current state before resetting
const before = await pool.query(
  `SELECT organization_id, prefix, year, last_value FROM document_sequences
   WHERE organization_id = $1 AND prefix = $2 AND year = $3`,
  [ORG_ID, PREFIX, YEAR]
);

if (!before.rowCount) {
  console.log(`No INV sequence row found for org ${ORG_ID} / year ${YEAR}.`);
  console.log('The next invoice will naturally start at 001 (row auto-creates at 0).');
  await pool.end();
  process.exit(0);
}

console.log(`Current INV sequence (${before.rows[0].year}): last_value = ${before.rows[0].last_value}`);

// Reset to 0 so the next increment yields 1 → suffix "001"
await pool.query(
  `UPDATE document_sequences SET last_value = 0
   WHERE organization_id = $1 AND prefix = $2 AND year = $3`,
  [ORG_ID, PREFIX, YEAR]
);

const after = await pool.query(
  `SELECT last_value FROM document_sequences
   WHERE organization_id = $1 AND prefix = $2 AND year = $3`,
  [ORG_ID, PREFIX, YEAR]
);

console.log(`Reset complete. next_value will be ${(Number(after.rows[0].last_value) + 1)} → suffix "${String(after.rows[0].last_value + 1).padStart(3, '0')}"`);
await pool.end();
