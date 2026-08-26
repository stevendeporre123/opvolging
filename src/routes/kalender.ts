import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';

export const kalenderRoutes = new Hono<{ Bindings: Env }>();

kalenderRoutes.get('/', requireAuth, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT k.*, o.naam AS orgaan_naam FROM kalender_commissies k
     LEFT JOIN organen o ON o.id = k.orgaan_id
     ORDER BY k.datum DESC`,
  ).all();
  return c.json(results);
});

kalenderRoutes.post('/', requireAuth, requireRole('bestuursondersteuning'), async (c) => {
  const body = await c.req.json<{ orgaan_id?: number; datum?: string; titel?: string; opmerking?: string }>();
  if (!body.datum || !body.titel?.trim()) return c.json({ fout: 'Datum en titel zijn verplicht' }, 400);
  const res = await c.env.DB.prepare(
    'INSERT INTO kalender_commissies (orgaan_id, datum, titel, opmerking) VALUES (?, ?, ?, ?)',
  )
    .bind(body.orgaan_id ?? null, body.datum, body.titel.trim(), body.opmerking ?? '')
    .run();
  return c.json({ id: res.meta.last_row_id }, 201);
});

kalenderRoutes.put('/:id', requireAuth, requireRole('bestuursondersteuning'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ orgaan_id?: number; datum?: string; titel?: string; opmerking?: string }>();
  if (!body.datum || !body.titel?.trim()) return c.json({ fout: 'Datum en titel zijn verplicht' }, 400);
  await c.env.DB.prepare(
    "UPDATE kalender_commissies SET orgaan_id = ?, datum = ?, titel = ?, opmerking = ?, gewijzigd_op = datetime('now') WHERE id = ?",
  )
    .bind(body.orgaan_id ?? null, body.datum, body.titel.trim(), body.opmerking ?? '', id)
    .run();
  return c.json({ ok: true });
});

kalenderRoutes.delete('/:id', requireAuth, requireRole('bestuursondersteuning'), async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM kalender_commissies WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

/**
 * Webhook voor de import van de SharePoint-kalenderlijst. Beveiligd met een
 * gedeelde sleutel (header X-Import-Key) i.p.v. sessie-auth, zodat een Power
 * Automate-flow (getriggerd op wijzigingen in de SharePoint-lijst) dit
 * endpoint rechtstreeks kan aanroepen. Items worden gededupliceerd op
 * sharepoint_item_id: bestaande items worden bijgewerkt, nieuwe toegevoegd.
 *
 * Verwacht: { items: [{ sharepoint_item_id, datum, titel, orgaan_naam?, opmerking? }] }
 */
kalenderRoutes.post('/import', async (c) => {
  const importKey = c.req.header('X-Import-Key');
  if (!c.env.SHAREPOINT_IMPORT_KEY || importKey !== c.env.SHAREPOINT_IMPORT_KEY) {
    return c.json({ fout: 'Ongeldige of ontbrekende import-sleutel' }, 401);
  }

  const body = await c.req.json<{
    items?: Array<{ sharepoint_item_id: string; datum: string; titel: string; orgaan_naam?: string; opmerking?: string }>;
  }>().catch(() => null);
  if (!body?.items?.length) return c.json({ fout: 'Geen items ontvangen' }, 400);

  let toegevoegd = 0;
  let bijgewerkt = 0;
  for (const item of body.items) {
    if (!item.sharepoint_item_id || !item.datum || !item.titel) continue;

    let orgaanId: number | null = null;
    if (item.orgaan_naam) {
      const orgaan = await c.env.DB.prepare('SELECT id FROM organen WHERE naam = ?')
        .bind(item.orgaan_naam.trim())
        .first<{ id: number }>();
      orgaanId = orgaan?.id ?? null;
    }

    const bestaand = await c.env.DB.prepare('SELECT id FROM kalender_commissies WHERE sharepoint_item_id = ?')
      .bind(item.sharepoint_item_id)
      .first<{ id: number }>();

    if (bestaand) {
      await c.env.DB.prepare(
        "UPDATE kalender_commissies SET datum = ?, titel = ?, orgaan_id = ?, opmerking = ?, gewijzigd_op = datetime('now') WHERE id = ?",
      )
        .bind(item.datum, item.titel, orgaanId, item.opmerking ?? '', bestaand.id)
        .run();
      bijgewerkt++;
    } else {
      await c.env.DB.prepare(
        'INSERT INTO kalender_commissies (sharepoint_item_id, datum, titel, orgaan_id, opmerking) VALUES (?, ?, ?, ?, ?)',
      )
        .bind(item.sharepoint_item_id, item.datum, item.titel, orgaanId, item.opmerking ?? '')
        .run();
      toegevoegd++;
    }
  }

  return c.json({ toegevoegd, bijgewerkt });
});
