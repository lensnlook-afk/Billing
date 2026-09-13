import { createHash, randomBytes } from 'node:crypto';
import { hash, verify, Algorithm } from '@node-rs/argon2';
import type { FastifyRequest } from 'fastify';
import { pool } from './db.js';
import { config } from './config.js';

export type Actor = { id: string; loginName: string; displayName: string; roles: string[]; permissions: Set<string>; sessionId: string };
export const sessionCookie = 'clarity_session';
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function passwordHash(password: string) { return hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }); }
export async function passwordVerify(password: string, passwordHashValue: string) { return verify(passwordHashValue, password); }
export function createToken() { return randomBytes(32).toString('base64url'); }
export function sessionCookieOptions() { return { path: '/', httpOnly: true, sameSite: 'strict' as const, secure: config.COOKIE_SECURE === 'true', maxAge: 60 * 60 * 12 }; }
export async function getActor(request: FastifyRequest): Promise<Actor | null> {
  const token = request.cookies[sessionCookie]; if (!token) return null;
  const { rows } = await pool.query(`SELECT s.id session_id,u.id,u.login_name,u.display_name, array_remove(array_agg(DISTINCT r.code),NULL) roles, array_remove(array_agg(DISTINCT p.code),NULL) permissions
    FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN user_roles ur ON ur.user_id=u.id LEFT JOIN roles r ON r.id=ur.role_id LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.is_active GROUP BY s.id,u.id`, [tokenHash(token)]);
  const row = rows[0]; return row ? { id: row.id, loginName:row.login_name, displayName: row.display_name, roles: row.roles ?? [], permissions: new Set(row.permissions ?? []), sessionId: row.session_id } : null;
}
export function clientIp(request: FastifyRequest) { return request.ip || null; }
