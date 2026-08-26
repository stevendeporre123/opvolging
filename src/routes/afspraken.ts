import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { sendEmail, parseEmailList, arrayBufferToBase64 } from '../lib/email';
import { alsBestand } from '../lib/formdata';

export const afsprakenRoutes = new Hono<{ Bindings: Env }>();

afsprakenRoutes.use('*', requireAuth);

const SELECT_BASE = `
  SELECT a.*, s.naam AS schepen_naam, o.naam AS orgaan_naam, k.titel AS kalender_titel, k.datum AS kalender_datum
  FROM afspraken a
  LEFT JOIN schepenen s ON s.id = a.schepen_id
  LEFT JOIN organen o ON o.id = a.orgaan_id
  LEFT JOIN kalender_commissies k ON k.id = a.kalender_id
`;

afsprakenRoutes.get('/', async (c) => {
  const user = c.get('user');
  if (user.rol === 'schepen') {
    if (!user.schepen_id) return c.json([]);
    const { results } = await c.env.DB.prepare(`${SELECT_BASE} WHERE a.schepen_id = ? ORDER BY a.datum_commissie DESC`)
      .bind(user.schepen_id)
      .all();
    return c.json(results);
  }
  // bestuursondersteuning en raadslid zien alles
  const { results } = await c.env.DB.prepare(`${SELECT_BASE} ORDER BY a.datum_commissie DESC`).all();
  return c.json(results);
});

afsprakenRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const row = await c.env.DB.prepare(`${SELECT_BASE} WHERE a.id = ?`).bind(id).first();
  if (!row) return c.json({ fout: 'Niet gevonden' }, 404);
  if (user.rol === 'schepen' && row.schepen_id !== user.schepen_id) return c.json({ fout: 'Onvoldoende rechten' }, 403);
  return c.json(row);
});

afsprakenRoutes.post('/', requireRole('bestuursondersteuning'), async (c) => {
  const body = await c.req.json<{
    orgaan_id?: number;
    schepen_id?: number;
    kalender_id?: number;
    agendapunt?: string;
    omschrijving?: string;
    gevraagd_door?: string;
    datum_commissie?: string;
    deadline?: string;
    notitie?: string;
  }>();
  if (!body.omschrijving?.trim()) return c.json({ fout: 'Omschrijving is verplicht' }, 400);
  const user = c.get('user');
  const res = await c.env.DB.prepare(
    `INSERT INTO afspraken
      (orgaan_id, schepen_id, kalender_id, agendapunt, omschrijving, gevraagd_door, datum_commissie, deadline, notitie, aangemaakt_door)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      body.orgaan_id ?? null,
      body.schepen_id ?? null,
      body.kalender_id ?? null,
      body.agendapunt ?? '',
      body.omschrijving.trim(),
      body.gevraagd_door ?? '',
      body.datum_commissie ?? null,
      body.deadline ?? null,
      body.notitie ?? '',
      user.id,
    )
    .run();
  return c.json({ id: res.meta.last_row_id }, 201);
});

afsprakenRoutes.put('/:id', requireRole('bestuursondersteuning'), async (c) => {
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
    notitie?: string;
  }>();
  if (!body.omschrijving?.trim()) return c.json({ fout: 'Omschrijving is verplicht' }, 400);
  await c.env.DB.prepare(
    `UPDATE afspraken SET orgaan_id = ?, schepen_id = ?, kalender_id = ?, agendapunt = ?, omschrijving = ?,
       gevraagd_door = ?, datum_commissie = ?, deadline = ?, notitie = ?, gewijzigd_op = datetime('now')
     WHERE id = ?`,
  )
    .bind(
      body.orgaan_id ?? null,
      body.schepen_id ?? null,
      body.kalender_id ?? null,
      body.agendapunt ?? '',
      body.omschrijving.trim(),
      body.gevraagd_door ?? '',
      body.datum_commissie ?? null,
      body.deadline ?? null,
      body.notitie ?? '',
      id,
    )
    .run();
  return c.json({ ok: true });
});

afsprakenRoutes.delete('/:id', requireRole('bestuursondersteuning'), async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT msg_r2_key FROM afspraken WHERE id = ?').bind(id).first<{ msg_r2_key: string | null }>();
  if (row?.msg_r2_key) await c.env.BUCKET.delete(row.msg_r2_key);
  await c.env.DB.prepare('DELETE FROM afspraken WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// --- Herinneringen (max. 3) --------------------------------------------

afsprakenRoutes.post('/:id/herinnering', requireRole('bestuursondersteuning'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const afspraak = await c.env.DB.prepare(
    `SELECT a.*, s.naam AS schepen_naam, s.emails AS schepen_emails FROM afspraken a
     LEFT JOIN schepenen s ON s.id = a.schepen_id WHERE a.id = ?`,
  )
    .bind(id)
    .first<{
      id: number;
      omschrijving: string;
      agendapunt: string;
      aantal_herinneringen: number;
      is_beantwoord: number;
      schepen_naam: string | null;
      schepen_emails: string | null;
    }>();
  if (!afspraak) return c.json({ fout: 'Niet gevonden' }, 404);
  if (afspraak.is_beantwoord) return c.json({ fout: 'Deze afspraak is al beantwoord' }, 409);
  if (afspraak.aantal_herinneringen >= 3) return c.json({ fout: 'Maximum van 3 herinneringen al bereikt' }, 409);
  const ontvangers = parseEmailList(afspraak.schepen_emails ?? '');
  if (ontvangers.length === 0) return c.json({ fout: 'Geen e-mailadres bekend voor dit kabinet' }, 400);

  const volgnummer = afspraak.aantal_herinneringen + 1;
  const resultaat = await sendEmail(c.env, {
    to: ontvangers,
    subject: `Herinnering ${volgnummer}/3 - Openstaande afspraak commissie${afspraak.agendapunt ? ' - ' + afspraak.agendapunt : ''}`,
    html: `
      <p>Beste,</p>
      <p>Dit is een herinnering (${volgnummer}/3) aan de volgende afspraak uit de commissiewerknota, waarop nog geen antwoord werd ontvangen:</p>
      <blockquote>${escapeHtml(afspraak.omschrijving)}</blockquote>
      <p>Gelieve het antwoord zo snel mogelijk te bezorgen aan de dienst bestuursondersteuning.</p>
      <p>Met vriendelijke groeten,<br/>Dienst bestuursondersteuning</p>
    `,
  });

  if (!resultaat.verzonden) return c.json({ fout: resultaat.reden ?? 'Versturen mislukt' }, 502);

  await c.env.DB.prepare(
    "UPDATE afspraken SET aantal_herinneringen = ?, laatste_herinnering_op = datetime('now') WHERE id = ?",
  )
    .bind(volgnummer, id)
    .run();
  await c.env.DB.prepare(
    'INSERT INTO herinneringen (afspraak_id, volgnummer, ontvangers, verzonden_door) VALUES (?, ?, ?, ?)',
  )
    .bind(id, volgnummer, ontvangers.join(', '), user.id)
    .run();

  return c.json({ ok: true, volgnummer });
});

// --- MSG-bestand (antwoordmail) -----------------------------------------

afsprakenRoutes.post('/:id/msg', requireRole('bestuursondersteuning'), async (c) => {
  const id = c.req.param('id');
  const form = await c.req.formData();
  const file = alsBestand(form.get('bestand'));
  if (!file) return c.json({ fout: 'Geen bestand ontvangen' }, 400);
  if (!file.name.toLowerCase().endsWith('.msg')) return c.json({ fout: 'Enkel .msg bestanden worden ondersteund' }, 400);

  const bestaand = await c.env.DB.prepare('SELECT msg_r2_key FROM afspraken WHERE id = ?').bind(id).first<{ msg_r2_key: string | null }>();
  if (!bestaand) return c.json({ fout: 'Niet gevonden' }, 404);
  if (bestaand.msg_r2_key) await c.env.BUCKET.delete(bestaand.msg_r2_key);

  const buffer = await file.arrayBuffer();
  const r2Key = `msg/${id}/${crypto.randomUUID()}-${file.name}`;
  await c.env.BUCKET.put(r2Key, buffer, { httpMetadata: { contentType: 'application/vnd.ms-outlook' } });

  await c.env.DB.prepare(
    "UPDATE afspraken SET msg_r2_key = ?, msg_bestandsnaam = ?, gewijzigd_op = datetime('now') WHERE id = ?",
  )
    .bind(r2Key, file.name, id)
    .run();

  return c.json({ ok: true });
});

afsprakenRoutes.get('/:id/msg', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const row = await c.env.DB.prepare('SELECT msg_r2_key, msg_bestandsnaam, schepen_id, is_beantwoord FROM afspraken WHERE id = ?')
    .bind(id)
    .first<{ msg_r2_key: string | null; msg_bestandsnaam: string | null; schepen_id: number | null; is_beantwoord: number }>();
  if (!row?.msg_r2_key) return c.json({ fout: 'Geen bestand aanwezig' }, 404);
  if (user.rol === 'schepen' && row.schepen_id !== user.schepen_id) return c.json({ fout: 'Onvoldoende rechten' }, 403);
  if (user.rol === 'raadslid' && !row.is_beantwoord) return c.json({ fout: 'Nog niet beschikbaar' }, 403);

  const obj = await c.env.BUCKET.get(row.msg_r2_key);
  if (!obj) return c.json({ fout: 'Bestand niet gevonden' }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/vnd.ms-outlook',
      'Content-Disposition': `attachment; filename="${row.msg_bestandsnaam ?? 'antwoord.msg'}"`,
    },
  });
});

// --- Markeren als beantwoord (+ eindmail naar raadsleden) ---------------

afsprakenRoutes.put('/:id/beantwoord', requireRole('bestuursondersteuning'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<{ is_beantwoord?: boolean }>();
  const gewenst = !!body.is_beantwoord;

  const afspraak = await c.env.DB.prepare(
    `SELECT a.*, o.naam AS orgaan_naam, o.emails AS orgaan_emails, s.naam AS schepen_naam FROM afspraken a
     LEFT JOIN organen o ON o.id = a.orgaan_id
     LEFT JOIN schepenen s ON s.id = a.schepen_id
     WHERE a.id = ?`,
  )
    .bind(id)
    .first<{
      id: number;
      omschrijving: string;
      agendapunt: string;
      msg_r2_key: string | null;
      msg_bestandsnaam: string | null;
      eindmail_verstuurd: number;
      orgaan_naam: string | null;
      orgaan_emails: string | null;
      schepen_naam: string | null;
    }>();
  if (!afspraak) return c.json({ fout: 'Niet gevonden' }, 404);

  if (!gewenst) {
    await c.env.DB.prepare("UPDATE afspraken SET is_beantwoord = 0, beantwoord_op = NULL, gewijzigd_op = datetime('now') WHERE id = ?")
      .bind(id)
      .run();
    return c.json({ ok: true });
  }

  if (!afspraak.msg_r2_key) return c.json({ fout: 'Er is nog geen .msg-antwoordbestand toegevoegd aan deze afspraak' }, 400);

  await c.env.DB.prepare("UPDATE afspraken SET is_beantwoord = 1, beantwoord_op = datetime('now'), gewijzigd_op = datetime('now') WHERE id = ?")
    .bind(id)
    .run();

  if (!afspraak.eindmail_verstuurd) {
    const ontvangers = parseEmailList(afspraak.orgaan_emails ?? '');
    if (ontvangers.length > 0) {
      const bestand = await c.env.BUCKET.get(afspraak.msg_r2_key);
      const attachments = bestand
        ? [
            {
              filename: afspraak.msg_bestandsnaam ?? 'antwoord.msg',
              content: arrayBufferToBase64(await bestand.arrayBuffer()),
              contentType: 'application/vnd.ms-outlook',
            },
          ]
        : [];
      const resultaat = await sendEmail(c.env, {
        to: ontvangers,
        subject: `Antwoord ontvangen - ${afspraak.agendapunt || 'afspraak commissie'}`,
        html: `
          <p>Geachte,</p>
          <p>Op de volgende afspraak uit de commissiewerknota${afspraak.schepen_naam ? ` (schepen ${escapeHtml(afspraak.schepen_naam)})` : ''} werd een antwoord ontvangen. Dit vindt u in bijlage.</p>
          <blockquote>${escapeHtml(afspraak.omschrijving)}</blockquote>
          <p>Met vriendelijke groeten,<br/>Dienst bestuursondersteuning</p>
        `,
        attachments,
      });
      if (resultaat.verzonden) {
        await c.env.DB.prepare("UPDATE afspraken SET eindmail_verstuurd = 1, eindmail_verstuurd_op = datetime('now') WHERE id = ?")
          .bind(id)
          .run();
      } else {
        return c.json({ ok: true, waarschuwing: `Afspraak gemarkeerd als beantwoord, maar mail kon niet worden verstuurd: ${resultaat.reden}` });
      }
    }
  }

  return c.json({ ok: true });
});

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
