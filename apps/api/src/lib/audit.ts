import { createHash, randomUUID } from 'node:crypto';
import type { Db } from './db.js';
import type { Actor } from './auth.js';
export type AuditInput = { action: string; entityType: string; entityId?: string; previousValue?: unknown; newValue?: unknown; reason?: string; transactionId?: string; ip?: string | null; requestId?: string };
const stringify = (value: unknown) => JSON.stringify(value ?? null);
export async function audit(db: Db, actor: Actor | null, event: AuditInput) {
  const head = await db.query(`SELECT last_hash FROM audit_chain_heads WHERE scope='global' FOR UPDATE`); const previousHash = head.rows[0].last_hash;
  const record = { actorId: actor?.id ?? null, roles: actor?.roles ?? [], action: event.action, entityType: event.entityType, entityId: event.entityId ?? null, previousValue: event.previousValue ?? null, newValue: event.newValue ?? null, reason: event.reason ?? null, transactionId: event.transactionId ?? null };
  const canonicalPayload = stringify(record); const eventHash = createHash('sha256').update(previousHash + canonicalPayload).digest('hex'); const id = randomUUID();
  await db.query(`INSERT INTO audit_logs(id,actor_id,actor_login,actor_roles,ip,session_id,request_id,action,entity_type,entity_id,previous_value,new_value,reason,transaction_id,canonical_payload,previous_hash,event_hash)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [id, actor?.id ?? null, actor?.loginName ?? null, actor?.roles ?? [], event.ip, actor?.sessionId ?? null, event.requestId ?? null, event.action,event.entityType,event.entityId ?? null,event.previousValue ?? null,event.newValue ?? null,event.reason ?? null,event.transactionId ?? null,canonicalPayload,previousHash,eventHash]);
  await db.query(`UPDATE audit_chain_heads SET last_hash=$1 WHERE scope='global'`, [eventHash]); return id;
}
