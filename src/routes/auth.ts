import { Hono } from 'hono';
import type { Env } from '../types';
import {
  createSession,
  destroySession,
  parseCookie,
  sessionCookieHeader,
  clearSessionCookieHeader,
  verifyPassword,
  SESSION_COOKIE,
} from '../lib/auth';
import { requireAuth } from '../middleware/auth';

export const authRoutes = new Hono<{ Bindings: Env }>();

authRoutes.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; wachtwoord?: string }>().catch(() => null);
  if (!body?.email || !body.wachtwoord) return c.json({ fout: 'E-mail en wachtwoord vereist' }, 400);

  const user = await c.env.DB.prepare(
    'SELECT id, email, naam, rol, schepen_id, wachtwoord_hash, wachtwoord_salt FROM users WHERE email = ? AND actief = 1',
  )
    .bind(body.email.trim().toLowerCase())
    .first<{
      id: number;
      email: string;
      naam: string;
      rol: string;
      schepen_id: number | null;
      wachtwoord_hash: string;
      wachtwoord_salt: string;
    }>();

  if (!user) return c.json({ fout: 'Ongeldige combinatie van e-mail en wachtwoord' }, 401);

  const ok = await verifyPassword(body.wachtwoord, user.wachtwoord_hash, user.wachtwoord_salt);
  if (!ok) return c.json({ fout: 'Ongeldige combinatie van e-mail en wachtwoord' }, 401);

  const { token, expires } = await createSession(c.env, user.id);
  c.header('Set-Cookie', sessionCookieHeader(token, expires));
  return c.json({
    id: user.id,
    email: user.email,
    naam: user.naam,
    rol: user.rol,
    schepen_id: user.schepen_id,
  });
});

authRoutes.post('/logout', async (c) => {
  const token = parseCookie(c.req.header('Cookie') ?? null, SESSION_COOKIE);
  if (token) await destroySession(c.env, token);
  c.header('Set-Cookie', clearSessionCookieHeader());
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, async (c) => {
  return c.json(c.get('user'));
});
