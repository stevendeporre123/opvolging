import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { extractAfsprakenFromDocx } from '../lib/docxParser';
import { alsBestand } from '../lib/formdata';

export const werknotaRoutes = new Hono<{ Bindings: Env }>();

werknotaRoutes.use('*', requireAuth, requireRole('bestuursondersteuning'));

werknotaRoutes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT w.*, k.titel AS kalender_titel, k.datum AS kalender_datum,
       (SELECT COUNT(*) FROM afspraken_staging s WHERE s.werknota_id = w.id AND s.status = 'nieuw') AS aantal_te_beoordelen
     FROM werknotas w LEFT JOIN kalender_commissies k ON k.id = w.kalender_id
     ORDER BY w.geupload_op DESC`,
  ).all();
  return c.json(results);
});

werknotaRoutes.post('/upload', async (c) => {
  const form = await c.req.formData();
  const file = alsBestand(form.get('bestand'));
  const kalenderId = form.get('kalender_id');
  if (!file) return c.json({ fout: 'Geen bestand ontvangen' }, 400);
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return c.json({ fout: 'Enkel .docx bestanden worden ondersteund' }, 400);
  }

  const buffer = await file.arrayBuffer();
  const r2Key = `werknotas/${crypto.randomUUID()}-${file.name}`;
  await c.env.BUCKET.put(r2Key, buffer, { httpMetadata: { contentType: file.type || 'application/octet-stream' } });

  const user = c.get('user');
  const insertRes = await c.env.DB.prepare(
    'INSERT INTO werknotas (kalender_id, bestandsnaam, r2_key, geupload_door) VALUES (?, ?, ?, ?)',
  )
    .bind(kalenderId ? Number(kalenderId) : null, file.name, r2Key, user.id)
    .run();
  const werknotaId = insertRes.meta.last_row_id as number;

  let geextraheerd: Awaited<ReturnType<typeof extractAfsprakenFromDocx>> = [];
  try {
    geextraheerd = await extractAfsprakenFromDocx(buffer);
  } catch (err) {
    return c.json(
      { id: werknotaId, fout: `Bestand opgeslagen, maar automatische extractie is mislukt: ${(err as Error).message}` },
      207,
    );
  }

  for (const item of geextraheerd) {
    await c.env.DB.prepare(
      `INSERT INTO afspraken_staging (werknota_id, agendapunt, omschrijving, schepen_suggestie, gevraagd_door, ruwe_data)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(werknotaId, item.agendapunt, item.omschrijving, item.schepen_suggestie, item.gevraagd_door, JSON.stringify(item.ruwe_data))
      .run();
  }

  return c.json({ id: werknotaId, aantal_gevonden: geextraheerd.length }, 201);
});

werknotaRoutes.get('/:id/staging', async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM afspraken_staging WHERE werknota_id = ? ORDER BY id')
    .bind(id)
    .all();
  return c.json(results);
});

werknotaRoutes.post('/staging/:id/goedkeuren', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{
    orgaan_id?: number;
    schepen_id?: number;
    kalender_id?: number;
    agendapunt?: string;
    omschrijving?: string;
    gevraagd_door?: string;
    datum_commissie?: string;
    deadline?: string;
  }>();

  const staging = await c.env.DB.prepare('SELECT * FROM afspraken_staging WHERE id = ?').bind(id).first<{
    id: number;
    werknota_id: number;
    agendapunt: string;
    omschrijving: string;
    gevraagd_door: string;
    status: string;
  }>();
  if (!staging) return c.json({ fout: 'Niet gevonden' }, 404);
  if (staging.status !== 'nieuw') return c.json({ fout: 'Dit item is al beoordeeld' }, 409);

  const user = c.get('user');
  const res = await c.env.DB.prepare(
    `INSERT INTO afspraken
      (werknota_id, kalender_id, orgaan_id, schepen_id, agendapunt, omschrijving, gevraagd_door, datum_commissie, deadline, aangemaakt_door)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      staging.werknota_id,
      body.kalender_id ?? null,
      body.orgaan_id ?? null,
      body.schepen_id ?? null,
      body.agendapunt ?? staging.agendapunt,
      body.omschrijving ?? staging.omschrijving,
      body.gevraagd_door ?? staging.gevraagd_door,
      body.datum_commissie ?? null,
      body.deadline ?? null,
      user.id,
    )
    .run();

  await c.env.DB.prepare("UPDATE afspraken_staging SET status = 'goedgekeurd' WHERE id = ?").bind(id).run();

  return c.json({ id: res.meta.last_row_id }, 201);
});

werknotaRoutes.post('/staging/:id/negeren', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare("UPDATE afspraken_staging SET status = 'genegeerd' WHERE id = ?").bind(id).run();
  return c.json({ ok: true });
});
