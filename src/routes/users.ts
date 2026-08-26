import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { hashPassword } from '../lib/auth';

export const usersRoutes = new Hono<{ Bindings: Env }>();

usersRoutes.use('*', requireAuth, requireRole('bestuursondersteuning'));

usersRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.naam, u.rol, u.schepen_id, u.actief, s.naam AS schepen_naam
     FROM users u LEFT JOIN schepenen s ON s.id = u.schepen_id ORDER BY u.naam`,
  ).all();
  return c.json(results);
});

usersRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    email?: string;
    naam?: string;
    wachtwoord?: string;
    rol?: 'bestuursondersteuning' | 'schepen' | 'raadslid';
    schepen_id?: number;
  }>();
  if (!body.email?.trim() || !body.naam?.trim() || !body.wachtwoord || !body.rol) {
    return c.json({ fout: 'E-mail, naam, wachtwoord en rol zijn verplicht' }, 400);
  }
  if (body.wachtwoord.length < 8) return c.json({ fout: 'Wachtwoord moet minstens 8 tekens bevatten' }, 400);
  if (body.rol === 'schepen' && !body.schepen_id) return c.json({ fout: 'Kies een schepen voor dit account' }, 400);

  const { hash, salt } = await hashPassword(body.wachtwoord);
  try {
    const res = await c.env.DB.prepare(
      'INSERT INTO users (email, naam, wachtwoord_hash, wachtwoord_salt, rol, schepen_id) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind(body.email.trim().toLowerCase(), body.naam.trim(), hash, salt, body.rol, body.rol === 'schepen' ? body.schepen_id : null)
      .run();
    return c.json({ id: res.meta.last_row_id }, 201);
  } catch {
    return c.json({ fout: 'Dit e-mailadres bestaat al' }, 409);
  }
});

usersRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ naam?: string; rol?: string; schepen_id?: number; actief?: boolean; wachtwoord?: string }>();
  if (!body.naam?.trim() || !body.rol) return c.json({ fout: 'Naam en rol zijn verplicht' }, 400);

  if (body.wachtwoord) {
    if (body.wachtwoord.length < 8) return c.json({ fout: 'Wachtwoord moet minstens 8 tekens bevatten' }, 400);
    const { hash, salt } = await hashPassword(body.wachtwoord);
    await c.env.DB.prepare('UPDATE users SET wachtwoord_hash = ?, wachtwoord_salt = ? WHERE id = ?').bind(hash, salt, id).run();
  }

  await c.env.DB.prepare('UPDATE users SET naam = ?, rol = ?, schepen_id = ?, actief = ? WHERE id = ?')
    .bind(body.naam.trim(), body.rol, body.rol === 'schepen' ? body.schepen_id ?? null : null, body.actief === false ? 0 : 1, id)
    .run();
  return c.json({ ok: true });
});

usersRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
