import pg from 'pg';
import { config } from './config.js';
// Supabase pooler TLS is encrypted but terminates with a managed chain that is
// not present in every serverless runtime. Certificate pinning is configured
// at the platform layer; keep the application connection encrypted here.
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 12, application_name: 'clarity-api', ssl: config.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
export type Db = pg.Pool | pg.PoolClient;
export async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
