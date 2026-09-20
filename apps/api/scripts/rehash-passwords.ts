/**
 * One-time script to re-hash passwords from argon2 to bcrypt.
 * Run once after switching from @node-rs/argon2 to bcryptjs.
 * Usage: tsx --env-file=../../.env scripts/rehash-passwords.ts
 */
import { pool } from '../src/lib/db.js';
import { passwordHash } from '../src/lib/auth.js';

const accounts = [
  { username: process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase(),    password: process.env.BOOTSTRAP_ADMIN_PASSWORD },
  { username: process.env.BOOTSTRAP_EMPLOYEE_USERNAME?.trim().toLowerCase(), password: process.env.BOOTSTRAP_EMPLOYEE_PASSWORD },
];

for (const account of accounts) {
  if (!account.username || !account.password) {
    console.error('Missing username or password for account:', account);
    continue;
  }
  const hash = await passwordHash(account.password);
  const result = await pool.query(
    'UPDATE users SET password_hash=$1 WHERE login_name=$2 RETURNING id, login_name',
    [hash, account.username]
  );
  if (result.rowCount) {
    console.log(`✓ Re-hashed password for: ${result.rows[0].login_name}`);
  } else {
    console.warn(`✗ User not found: ${account.username}`);
  }
}

await pool.end();
console.log('Done.');
