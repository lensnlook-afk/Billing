import { readdir, readFile } from 'node:fs/promises'; import { join } from 'node:path'; import { pool, transaction } from './lib/db.js';
const migrationDir = new URL('../migrations/', import.meta.url);
await transaction(async db => { await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'); const applied = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map(r => r.name)); for (const name of (await readdir(migrationDir)).filter(n => n.endsWith('.sql')).sort()) { if (!applied.has(name)) { console.log(`Applying ${name}`); try {
        await db.query(await readFile(join(migrationDir.pathname, name), 'utf8'));
      } catch (err) {
        // Ignore "relation already exists" errors (code 42P07)
        if (!(err && (err as NodeJS.ErrnoException & { code?: string }).code === '42P07')) {
          throw err;
        }
        // else continue – the migration was effectively applied
      }
      await db.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]); } } }); await pool.end();
