import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';

export const schepenenRoutes = new Hono<{ Bindings: Env }>();

schepenenRoutes.use('*', requireAuth);

schepenenRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM schepenen ORDER BY naam').all();
  return c.json(results);
});

schepenenRoutes.post('/', requireRole('bestuursondersteuning'), async (c) => {
  const body = await c.req.json<{ naam?: string; emails?: string; actief?: boolean }>();
  if (!body.naam?.trim()) return c.json({ fout: 'Naam is verplicht' }, 400);
  const res = await c.env.DB.prepare('INSERT INTO schepenen (naam, emails, actief) VALUES (?, ?, ?)')
    .bind(body.naam.trim(), body.emails ?? '', body.actief === false ? 0 : 1)
    .run();
  return c.json({ id: res.meta.last_row_id }, 201);
});

schepenenRoutes.put('/:id', requireRole('bestuursondersteuning'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ naam?: string; emails?: string; actief?: boolean }>();
  if (!body.naam?.trim()) return c.json({ fout: 'Naam is verplicht' }, 400);
  await c.env.DB.prepare('UPDATE schepenen SET naam = ?, emails = ?, actief = ? WHERE id = ?')
    .bind(body.naam.trim(), body.emails ?? '', body.actief === false ? 0 : 1, id)
    .run();
  return c.json({ ok: true });
});

schepenenRoutes.delete('/:id', requireRole('bestuursondersteuning'), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM schepenen WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});
