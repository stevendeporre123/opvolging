let organen = [];
let schepenen = [];
let werknotasTabel;
let huidigeWerknotaId = null;

(async () => {
  const user = await vereisAanmelding(['bestuursondersteuning']);
  if (!user) return;
  document.getElementById('app-shell').insertAdjacentHTML('afterbegin', bouwZijbalk('werknota', user));
  koppelAfmeldknop();

  const kalenders = await api('/kalender');
  vulSelect(
    'up-kalender',
    kalenders.map((k) => ({ id: k.id, naam: `${formatteerDatum(k.datum)} - ${k.titel}` })),
    'Geen zitting gekoppeld',
  );

  [organen, schepenen] = await Promise.all([api('/organen'), api('/schepenen')]);
  vulSelect('gk-orgaan', organen, 'Geen orgaan gekozen');
  vulSelect('gk-schepen', schepenen, 'Geen schepen gekozen');

  await laadWerknotas();

  document.getElementById('form-upload').addEventListener('submit', uploadWerknota);
  document.getElementById('btn-gk-annuleer').addEventListener('click', () => document.getElementById('modal-goedkeuren').classList.add('verborgen'));
  document.getElementById('form-goedkeuren').addEventListener('submit', goedkeuren);
})();

function vulSelect(id, items, leegLabel) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${leegLabel}</option>` + items.map((i) => `<option value="${i.id}">${escapeHtml(i.naam)}</option>`).join('');
}

async function laadWerknotas() {
  const data = await api('/werknota');
  const rijen = data.map((w) => ({
    datum: formatteerDatum(w.geupload_op),
    bestand: escapeHtml(w.bestandsnaam),
    zitting: w.kalender_titel ? `${formatteerDatum(w.kalender_datum)} - ${escapeHtml(w.kalender_titel)}` : '-',
    status: w.aantal_te_beoordelen > 0 ? `<span class="badge open">${w.aantal_te_beoordelen} te beoordelen</span>` : '<span class="badge beantwoord">Volledig verwerkt</span>',
    teBeoordelen: w.aantal_te_beoordelen,
    acties: `<button class="klein" data-actie="bekijk" data-id="${w.id}">Bekijk afspraken</button>`,
  }));

  if (werknotasTabel) {
    werknotasTabel.clear();
    werknotasTabel.rows.add(rijen).draw();
    return;
  }
  werknotasTabel = $('#tabel-werknotas').DataTable({
    data: rijen,
    columns: [
      { data: 'datum' },
      { data: 'bestand' },
      { data: 'zitting' },
      { data: 'status', orderable: false },
      { data: 'teBeoordelen' },
      { data: 'acties', orderable: false },
    ],
    order: [[0, 'desc']],
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.11/i18n/nl-NL.json' },
    pageLength: 10,
  });
  document.getElementById('tabel-werknotas').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-actie="bekijk"]');
    if (btn) toonStaging(btn.dataset.id);
  });
}

async function uploadWerknota(e) {
  e.preventDefault();
  const bestand = document.getElementById('up-bestand').files[0];
  if (!bestand) return;
  const fd = new FormData();
  fd.append('bestand', bestand);
  const kalenderId = document.getElementById('up-kalender').value;
  if (kalenderId) fd.append('kalender_id', kalenderId);

  try {
    const res = await api('/werknota/upload', { method: 'POST', body: fd });
    toonMelding('melding', `Werknota opgeladen. ${res.aantal_gevonden ?? 0} mogelijke afspraken gevonden - controleer ze hieronder.`, 'succes');
    document.getElementById('form-upload').reset();
    await laadWerknotas();
    if (res.id) toonStaging(res.id);
  } catch (err) {
    toonMelding('melding', err.message);
  }
}

async function toonStaging(werknotaId) {
  huidigeWerknotaId = werknotaId;
  const items = await api(`/werknota/${werknotaId}/staging`);
  const paneel = document.getElementById('paneel-staging');
  const lijst = document.getElementById('staging-lijst');
  paneel.classList.remove('verborgen');
  document.getElementById('staging-titel').textContent = `Te beoordelen afspraken (${items.filter((i) => i.status === 'nieuw').length} nog te doen)`;

  if (items.length === 0) {
    lijst.innerHTML = '<p class="kleine-tekst">Geen afspraken gevonden in dit document. Ze kunnen manueel worden toegevoegd via "Afspraken".</p>';
    return;
  }

  lijst.innerHTML = items
    .map(
      (item) => `
    <div class="staging-kaart">
      <div class="staging-koptekst">
        <div>
          <strong>${escapeHtml(item.agendapunt || 'Geen agendapunt herkend')}</strong>
          <div class="kleine-tekst">${escapeHtml(item.gevraagd_door || '')} ${item.schepen_suggestie ? '&middot; suggestie schepen: ' + escapeHtml(item.schepen_suggestie) : ''}</div>
        </div>
        <span class="badge ${item.status === 'nieuw' ? 'open' : item.status === 'goedgekeurd' ? 'beantwoord' : 'neutraal'}">${item.status}</span>
      </div>
      <p>${escapeHtml(item.omschrijving) || '<em>Geen omschrijving herkend</em>'}</p>
      ${
        item.status === 'nieuw'
          ? `<div class="acties-cel">
               <button class="klein primair" data-actie="goedkeuren" data-id="${item.id}" data-item='${JSON.stringify(item).replace(/'/g, '&#39;')}'>Goedkeuren</button>
               <button class="klein gevaar" data-actie="negeren" data-id="${item.id}">Negeren</button>
             </div>`
          : ''
      }
    </div>
  `,
    )
    .join('');

  lijst.querySelectorAll('button[data-actie="goedkeuren"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = JSON.parse(btn.dataset.item);
      document.getElementById('gk-staging-id').value = item.id;
      document.getElementById('gk-orgaan').value = '';
      document.getElementById('gk-schepen').value = '';
      document.getElementById('gk-agendapunt').value = item.agendapunt || '';
      document.getElementById('gk-omschrijving').value = item.omschrijving || '';
      document.getElementById('gk-gevraagd-door').value = item.gevraagd_door || '';
      document.getElementById('gk-datum').value = '';
      verbergMelding('goedkeuren-melding');
      document.getElementById('modal-goedkeuren').classList.remove('verborgen');
    });
  });
  lijst.querySelectorAll('button[data-actie="negeren"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/werknota/staging/${btn.dataset.id}/negeren`, { method: 'POST' });
      await toonStaging(huidigeWerknotaId);
      await laadWerknotas();
    });
  });
}

async function goedkeuren(e) {
  e.preventDefault();
  const id = document.getElementById('gk-staging-id').value;
  const body = {
    orgaan_id: Number(document.getElementById('gk-orgaan').value) || undefined,
    schepen_id: Number(document.getElementById('gk-schepen').value) || undefined,
    agendapunt: document.getElementById('gk-agendapunt').value,
    omschrijving: document.getElementById('gk-omschrijving').value,
    gevraagd_door: document.getElementById('gk-gevraagd-door').value,
    datum_commissie: document.getElementById('gk-datum').value || undefined,
  };
  try {
    await api(`/werknota/staging/${id}/goedkeuren`, { method: 'POST', body });
    document.getElementById('modal-goedkeuren').classList.add('verborgen');
    await toonStaging(huidigeWerknotaId);
    await laadWerknotas();
    toonMelding('melding', 'Afspraak toegevoegd aan de afsprakentabel.', 'succes');
  } catch (err) {
    toonMelding('goedkeuren-melding', err.message);
  }
}
