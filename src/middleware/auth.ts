import type { Context, Next } from 'hono';
import type { Env, Rol } from '../types';
import { getSessionUser, parseCookie, SESSION_COOKIE } from '../lib/auth';

export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const token = parseCookie(c.req.header('Cookie') ?? null, SESSION_COOKIE);
  const user = await getSessionUser(c.env, token);
  if (!user) return c.json({ fout: 'Niet aangemeld' }, 401);
  c.set('user', user);
  await next();
}

export function requireRole(...rollen: Rol[]) {
  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const user = c.get('user');
    if (!user || !rollen.includes(user.rol)) {
      return c.json({ fout: 'Onvoldoende rechten' }, 403);
    }
    await next();
  };
}
