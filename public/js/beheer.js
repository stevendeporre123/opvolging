let tabellen = {};
let organenCache = [];

(async () => {
  const user = await vereisAanmelding(['bestuursondersteuning']);
  if (!user) return;
  document.getElementById('app-shell').insertAdjacentHTML('afterbegin', bouwZijbalk('beheer', user));
  koppelAfmeldknop();

  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => wisselTab(btn.dataset.tab));
  });

  await laadSchepenen();
  await laadOrganen();
  await laadKalender();
  await laadUsers();

  koppelSchepenModal();
  koppelOrgaanModal();
  koppelZittingModal();
  koppelUserModal();
})();

function wisselTab(tab) {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('actief', b.dataset.tab === tab));
  document.querySelectorAll('[data-tabpaneel]').forEach((p) => p.classList.toggle('verborgen', p.dataset.tabpaneel !== tab));
}

function ddOpties(id, items, geselecteerd) {
  const el = document.getElementById(id);
  el.innerHTML = '<option value="">Geen</option>' + items.map((i) => `<option value="${i.id}" ${geselecteerd == i.id ? 'selected' : ''}>${escapeHtml(i.naam)}</option>`).join('');
}

// --- Schepenen -------------------------------------------------------

async function laadSchepenen() {
  const data = await api('/schepenen');
  const rijen = data.map((s) => ({
    naam: escapeHtml(s.naam),
    emails: escapeHtml(s.emails || '-'),
    actief: s.actief ? '<span class="badge beantwoord">Ja</span>' : '<span class="badge neutraal">Nee</span>',
    acties: `<div class="acties-cel"><button class="klein" data-actie="bewerk" data-id="${s.id}">Bewerken</button><button class="klein gevaar" data-actie="verwijder" data-id="${s.id}">Verwijderen</button></div>`,
    _raw: s,
  }));
  bouwTabel('tabel-schepenen', 'schepenen', rijen, [0, 1, 2, 3]);
  document.getElementById('tabel-schepenen').onclick = (e) => tabelActie(e, data, 'schepen');
}

function koppelSchepenModal() {
  document.getElementById('btn-nieuw-schepen').addEventListener('click', () => openGeneriekModal('schepen', null));
}

// --- Organen -----------------------------------------------------------

async function laadOrganen() {
  const data = await api('/organen');
  organenCache = data;
  const rijen = data.map((o) => ({
    naam: escapeHtml(o.naam),
    emails: escapeHtml(o.emails || '-'),
    actief: o.actief ? '<span class="badge beantwoord">Ja</span>' : '<span class="badge neutraal">Nee</span>',
    acties: `<div class="acties-cel"><button class="klein" data-actie="bewerk" data-id="${o.id}">Bewerken</button><button class="klein gevaar" data-actie="verwijder" data-id="${o.id}">Verwijderen</button></div>`,
  }));
  bouwTabel('tabel-organen', 'organen', rijen, [0, 1, 2, 3]);
  document.getElementById('tabel-organen').onclick = (e) => tabelActie(e, data, 'orgaan');
  ddOpties('zi-orgaan', organenCache);
}

function koppelOrgaanModal() {
  document.getElementById('btn-nieuw-orgaan').addEventListener('click', () => openGeneriekModal('orgaan', null));
}

function openGeneriekModal(type, item) {
  document.getElementById('generiek-titel').textContent = `${type === 'schepen' ? 'Schepen' : 'Orgaan'} ${item ? 'bewerken' : 'toevoegen'}`;
  document.getElementById('gen-type').value = type;
  document.getElementById('gen-id').value = item?.id || '';
  document.getElementById('gen-naam').value = item?.naam || '';
  document.getElementById('gen-emails').value = item?.emails || '';
  document.getElementById('gen-actief').checked = item ? !!item.actief : true;
  verbergMelding('generiek-melding');
  document.getElementById('modal-generiek').classList.remove('verborgen');
}

document.getElementById('btn-gen-annuleer')?.addEventListener('click', () => document.getElementById('modal-generiek').classList.add('verborgen'));
document.getElementById('form-generiek')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('gen-type').value;
  const id = document.getElementById('gen-id').value;
  const pad = type === 'schepen' ? '/schepenen' : '/organen';
  const body = {
    naam: document.getElementById('gen-naam').value,
    emails: document.getElementById('gen-emails').value,
    actief: document.getElementById('gen-actief').checked,
  };
  try {
    if (id) await api(`${pad}/${id}`, { method: 'PUT', body });
    else await api(pad, { method: 'POST', body });
    document.getElementById('modal-generiek').classList.add('verborgen');
    if (type === 'schepen') await laadSchepenen();
    else await laadOrganen();
  } catch (err) {
    toonMelding('generiek-melding', err.message);
  }
});

// --- Kalender ------------------------------------------------------------

async function laadKalender() {
  const data = await api('/kalender');
  const rijen = data.map((k) => ({
    datum: formatteerDatum(k.datum),
    titel: escapeHtml(k.titel),
    orgaan: escapeHtml(k.orgaan_naam || '-'),
    bron: k.sharepoint_item_id ? '<span class="badge neutraal">SharePoint</span>' : '<span class="badge neutraal">Manueel</span>',
    acties: `<div class="acties-cel"><button class="klein" data-actie="bewerk" data-id="${k.id}">Bewerken</button><button class="klein gevaar" data-actie="verwijder" data-id="${k.id}">Verwijderen</button></div>`,
  }));
  bouwTabel('tabel-kalender', 'kalender', rijen, [0, 1, 2, 3]);
  document.getElementById('tabel-kalender').onclick = (e) => tabelActie(e, data, 'zitting');
}

function koppelZittingModal() {
  document.getElementById('btn-nieuwe-zitting').addEventListener('click', () => openZittingModal(null));
  document.getElementById('btn-zi-annuleer').addEventListener('click', () => document.getElementById('modal-zitting').classList.add('verborgen'));
  document.getElementById('form-zitting').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('zi-id').value;
    const body = {
      titel: document.getElementById('zi-titel').value,
      datum: document.getElementById('zi-datum').value,
      orgaan_id: Number(document.getElementById('zi-orgaan').value) || undefined,
      opmerking: document.getElementById('zi-opmerking').value,
    };
    try {
      if (id) await api(`/kalender/${id}`, { method: 'PUT', body });
      else await api('/kalender', { method: 'POST', body });
      document.getElementById('modal-zitting').classList.add('verborgen');
      await laadKalender();
    } catch (err) {
      toonMelding('zitting-melding', err.message);
    }
  });
}

function openZittingModal(item) {
  document.getElementById('zitting-titel').textContent = item ? 'Zitting bewerken' : 'Nieuwe zitting';
  document.getElementById('zi-id').value = item?.id || '';
  document.getElementById('zi-titel').value = item?.titel || '';
  document.getElementById('zi-datum').value = item?.datum || '';
  ddOpties('zi-orgaan', organenCache, item?.orgaan_id);
  document.getElementById('zi-opmerking').value = item?.opmerking || '';
  verbergMelding('zitting-melding');
  document.getElementById('modal-zitting').classList.remove('verborgen');
}

// --- Users ---------------------------------------------------------------

async function laadUsers() {
  const data = await api('/users');
  const rijen = data.map((u) => ({
    naam: escapeHtml(u.naam),
    email: escapeHtml(u.email),
    rol: ROL_LABELS[u.rol] || u.rol,
    schepen: escapeHtml(u.schepen_naam || '-'),
    actief: u.actief ? '<span class="badge beantwoord">Ja</span>' : '<span class="badge neutraal">Nee</span>',
    acties: `<div class="acties-cel"><button class="klein" data-actie="bewerk" data-id="${u.id}">Bewerken</button><button class="klein gevaar" data-actie="verwijder" data-id="${u.id}">Verwijderen</button></div>`,
  }));
  bouwTabel('tabel-users', 'users', rijen, [0, 1, 2, 3, 4]);
  document.getElementById('tabel-users').onclick = (e) => tabelActie(e, data, 'user');
}

function koppelUserModal() {
  document.getElementById('btn-nieuwe-user').addEventListener('click', () => openUserModal(null));
  document.getElementById('btn-us-annuleer').addEventListener('click', () => document.getElementById('modal-user').classList.add('verborgen'));
  document.getElementById('us-rol').addEventListener('change', wisselRolVeld);
  document.getElementById('form-user').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('us-id').value;
    const body = {
      naam: document.getElementById('us-naam').value,
      email: document.getElementById('us-email').value,
      rol: document.getElementById('us-rol').value,
      schepen_id: Number(document.getElementById('us-schepen').value) || undefined,
      wachtwoord: document.getElementById('us-wachtwoord').value || undefined,
      actief: document.getElementById('us-actief').checked,
    };
    try {
      if (id) await api(`/users/${id}`, { method: 'PUT', body });
      else await api('/users', { method: 'POST', body });
      document.getElementById('modal-user').classList.add('verborgen');
      await laadUsers();
    } catch (err) {
      toonMelding('user-melding', err.message);
    }
  });
}

function wisselRolVeld() {
  const rol = document.getElementById('us-rol').value;
  document.getElementById('us-schepen-veld').classList.toggle('verborgen', rol !== 'schepen');
}

async function openUserModal(item) {
  document.getElementById('user-titel').textContent = item ? 'Gebruiker bewerken' : 'Nieuwe gebruiker';
  document.getElementById('us-id').value = item?.id || '';
  document.getElementById('us-naam').value = item?.naam || '';
  document.getElementById('us-email').value = item?.email || '';
  document.getElementById('us-email').disabled = !!item;
  document.getElementById('us-rol').value = item?.rol || 'bestuursondersteuning';
  const schepenen = await api('/schepenen');
  ddOpties('us-schepen', schepenen, item?.schepen_id);
  document.getElementById('us-wachtwoord').value = '';
  document.getElementById('us-wachtwoord-hint').textContent = item ? '(laat leeg om ongewijzigd te laten)' : '(minstens 8 tekens)';
  document.getElementById('us-wachtwoord').required = !item;
  document.getElementById('us-actief').checked = item ? !!item.actief : true;
  wisselRolVeld();
  verbergMelding('user-melding');
  document.getElementById('modal-user').classList.remove('verborgen');
}

// --- Gedeelde helpers ------------------------------------------------------

function bouwTabel(tableId, sleutel, rijen, kolomVeldenAantal) {
  if (tabellen[sleutel]) {
    tabellen[sleutel].clear();
    tabellen[sleutel].rows.add(rijen).draw();
    return;
  }
  const kolommen = Object.keys(rijen[0] || { a: 1, b: 1, c: 1, d: 1 })
    .filter((k) => !k.startsWith('_'))
    .map((data) => ({ data }));
  tabellen[sleutel] = $(`#${tableId}`).DataTable({
    data: rijen,
    columns: kolommen,
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.11/i18n/nl-NL.json' },
    pageLength: 10,
  });
}

async function tabelActie(e, brondata, soort) {
  const btn = e.target.closest('button[data-actie]');
  if (!btn) return;
  const id = btn.dataset.id;
  const actie = btn.dataset.actie;
  const item = brondata.find((x) => String(x.id) === String(id));

  if (actie === 'bewerk') {
    if (soort === 'schepen' || soort === 'orgaan') openGeneriekModal(soort, item);
    else if (soort === 'zitting') openZittingModal(item);
    else if (soort === 'user') openUserModal(item);
  } else if (actie === 'verwijder') {
    if (!confirm('Weet je zeker dat je dit wil verwijderen?')) return;
    const pad = { schepen: '/schepenen', orgaan: '/organen', zitting: '/kalender', user: '/users' }[soort];
    try {
      await api(`${pad}/${id}`, { method: 'DELETE' });
    } catch (err) {
      toonMelding('melding', err.message);
      return;
    }
    if (soort === 'schepen') await laadSchepenen();
    else if (soort === 'orgaan') await laadOrganen();
    else if (soort === 'zitting') await laadKalender();
    else if (soort === 'user') await laadUsers();
  }
}
