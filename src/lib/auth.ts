import type { Env, SessionUser } from '../types';

const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_HOURS = 12;
export const SESSION_COOKIE = 'ac_session';

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return { hash: toHex(bits), salt: toHex(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const check = await hashPassword(password, salt);
  return timingSafeEqual(check.hash, hash);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomToken(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}

export async function createSession(env: Env, userId: number): Promise<{ token: string; expires: Date }> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
  await env.DB.prepare('INSERT INTO sessies (id, user_id, verloopt_op) VALUES (?, ?, ?)')
    .bind(token, userId, expires.toISOString())
    .run();
  return { token, expires };
}

export async function destroySession(env: Env, token: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessies WHERE id = ?').bind(token).run();
}

export async function getSessionUser(env: Env, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.naam, u.rol, u.schepen_id, s.verloopt_op
     FROM sessies s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND u.actief = 1`,
  )
    .bind(token)
    .first<{ id: number; email: string; naam: string; rol: string; schepen_id: number | null; verloopt_op: string }>();
  if (!row) return null;
  if (new Date(row.verloopt_op).getTime() < Date.now()) {
    await destroySession(env, token);
    return null;
  }
  return { id: row.id, email: row.email, naam: row.naam, rol: row.rol as SessionUser['rol'], schepen_id: row.schepen_id };
}

export function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function sessionCookieHeader(token: string, expires: Date): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
