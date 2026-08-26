let organen = [];
let schepenen = [];
let kalenders = [];
let tabel;

(async () => {
  const user = await vereisAanmelding(['bestuursondersteuning']);
  if (!user) return;
  document.getElementById('app-shell').insertAdjacentHTML('afterbegin', bouwZijbalk('dashboard', user));
  koppelAfmeldknop();

  [organen, schepenen, kalenders] = await Promise.all([api('/organen'), api('/schepenen'), api('/kalender')]);
  vulSelect('af-orgaan', organen, 'Geen orgaan gekozen');
  vulSelect('af-schepen', schepenen, 'Geen schepen gekozen');
  vulSelect(
    'af-kalender',
    kalenders.map((k) => ({ id: k.id, naam: `${formatteerDatum(k.datum)} - ${k.titel}` })),
    'Geen zitting gekoppeld',
  );

  await laadAfspraken();

  document.getElementById('btn-nieuw').addEventListener('click', () => openModal());
  document.getElementById('btn-annuleer').addEventListener('click', sluitModal);
  document.getElementById('form-afspraak').addEventListener('submit', slaAfspraakOp);
})();

function vulSelect(id, items, leegLabel) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${leegLabel}</option>` + items.map((i) => `<option value="${i.id}">${escapeHtml(i.naam)}</option>`).join('');
}

async function laadAfspraken() {
  const data = await api('/afspraken');
  if (tabel) {
    tabel.clear();
    tabel.rows.add(data.map(rijData)).draw();
    return;
  }
  tabel = $('#tabel-afspraken').DataTable({
    data: data.map(rijData),
    columns: [
      { data: 'datum' },
      { data: 'orgaan' },
      { data: 'agendapunt' },
      { data: 'schepen' },
      { data: 'omschrijving' },
      { data: 'gevraagdDoor' },
      { data: 'status', orderable: true },
      { data: 'herinneringen' },
      { data: 'acties', orderable: false },
    ],
    order: [[0, 'desc']],
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.11/i18n/nl-NL.json' },
    pageLength: 25,
  });
  document.getElementById('tabel-afspraken').addEventListener('click', tabelKlik);
}

function rijData(a) {
  const statusBadge = a.is_beantwoord
    ? '<span class="badge beantwoord">Beantwoord</span>'
    : '<span class="badge open">Open</span>';
  return {
    id: a.id,
    datum: formatteerDatum(a.datum_commissie),
    orgaan: escapeHtml(a.orgaan_naam || '-'),
    agendapunt: escapeHtml(a.agendapunt || '-'),
    schepen: escapeHtml(a.schepen_naam || '-'),
    omschrijving: `<div style="max-width:280px; white-space:normal;">${escapeHtml(a.omschrijving)}</div>`,
    gevraagdDoor: escapeHtml(a.gevraagd_door || '-'),
    status: statusBadge,
    herinneringen: `${a.aantal_herinneringen}/3`,
    acties: `
      <div class="acties-cel">
        <button class="klein" data-actie="bewerk" data-id="${a.id}">Bewerken</button>
        <button class="klein" data-actie="herinnering" data-id="${a.id}" ${a.is_beantwoord || a.aantal_herinneringen >= 3 ? 'disabled' : ''}>Herinner</button>
        <button class="klein" data-actie="msg" data-id="${a.id}">${a.msg_bestandsnaam ? 'MSG vervangen' : 'MSG toevoegen'}</button>
        <button class="klein" data-actie="beantwoord" data-id="${a.id}" data-huidig="${a.is_beantwoord}">${a.is_beantwoord ? 'Zet op open' : 'Markeer beantwoord'}</button>
        <button class="klein gevaar" data-actie="verwijder" data-id="${a.id}">Verwijder</button>
      </div>
    `,
  };
}

async function tabelKlik(e) {
  const btn = e.target.closest('button[data-actie]');
  if (!btn) return;
  const id = btn.dataset.id;
  const actie = btn.dataset.actie;

  if (actie === 'bewerk') {
    const item = await api(`/afspraken/${id}`);
    openModal(item);
  } else if (actie === 'herinnering') {
    if (!confirm('Herinneringsmail versturen naar het kabinet van deze schepen?')) return;
    try {
      const r = await api(`/afspraken/${id}/herinnering`, { method: 'POST' });
      toonMelding('melding', `Herinnering ${r.volgnummer}/3 verstuurd.`, 'succes');
      await laadAfspraken();
    } catch (err) {
      toonMelding('melding', err.message);
    }
  } else if (actie === 'msg') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.msg';
    input.onchange = async () => {
      if (!input.files[0]) return;
      const fd = new FormData();
      fd.append('bestand', input.files[0]);
      try {
        await api(`/afspraken/${id}/msg`, { method: 'POST', body: fd });
        toonMelding('melding', 'MSG-bestand toegevoegd.', 'succes');
        await laadAfspraken();
      } catch (err) {
        toonMelding('melding', err.message);
      }
    };
    input.click();
  } else if (actie === 'beantwoord') {
    const huidig = btn.dataset.huidig === 'true';
    try {
      const r = await api(`/afspraken/${id}/beantwoord`, { method: 'PUT', body: { is_beantwoord: !huidig } });
      if (r.waarschuwing) toonMelding('melding', r.waarschuwing, 'fout');
      else toonMelding('melding', huidig ? 'Afspraak opnieuw geopend.' : 'Afspraak gemarkeerd als beantwoord. Mail met antwoord werd verstuurd naar het orgaan.', 'succes');
      await laadAfspraken();
    } catch (err) {
      toonMelding('melding', err.message);
    }
  } else if (actie === 'verwijder') {
    if (!confirm('Deze afspraak definitief verwijderen?')) return;
    await api(`/afspraken/${id}`, { method: 'DELETE' });
    await laadAfspraken();
  }
}

function openModal(item) {
  document.getElementById('modal-titel').textContent = item ? 'Afspraak bewerken' : 'Nieuwe afspraak';
  document.getElementById('af-id').value = item?.id || '';
  document.getElementById('af-orgaan').value = item?.orgaan_id || '';
  document.getElementById('af-schepen').value = item?.schepen_id || '';
  document.getElementById('af-kalender').value = item?.kalender_id || '';
  document.getElementById('af-datum').value = item?.datum_commissie || '';
  document.getElementById('af-agendapunt').value = item?.agendapunt || '';
  document.getElementById('af-omschrijving').value = item?.omschrijving || '';
  document.getElementById('af-gevraagd-door').value = item?.gevraagd_door || '';
  document.getElementById('af-deadline').value = item?.deadline || '';
  document.getElementById('af-notitie').value = item?.notitie || '';
  verbergMelding('modal-melding');
  document.getElementById('modal-afspraak').classList.remove('verborgen');
}

function sluitModal() {
  document.getElementById('modal-afspraak').classList.add('verborgen');
}

async function slaAfspraakOp(e) {
  e.preventDefault();
  const id = document.getElementById('af-id').value;
  const body = {
    orgaan_id: Number(document.getElementById('af-orgaan').value) || undefined,
    schepen_id: Number(document.getElementById('af-schepen').value) || undefined,
    kalender_id: Number(document.getElementById('af-kalender').value) || undefined,
    datum_commissie: document.getElementById('af-datum').value || undefined,
    agendapunt: document.getElementById('af-agendapunt').value,
    omschrijving: document.getElementById('af-omschrijving').value,
    gevraagd_door: document.getElementById('af-gevraagd-door').value,
    deadline: document.getElementById('af-deadline').value || undefined,
    notitie: document.getElementById('af-notitie').value,
  };
  try {
    if (id) await api(`/afspraken/${id}`, { method: 'PUT', body });
    else await api('/afspraken', { method: 'POST', body });
    sluitModal();
    await laadAfspraken();
    toonMelding('melding', 'Afspraak opgeslagen.', 'succes');
  } catch (err) {
    toonMelding('modal-melding', err.message);
  }
}
