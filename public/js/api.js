// Kleine fetch-wrapper voor de JSON-API. Sessie loopt via een HttpOnly cookie.
async function api(pad, opties = {}) {
  const res = await fetch(`/api${pad}`, {
    method: opties.method || 'GET',
    headers: opties.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: opties.body instanceof FormData ? opties.body : opties.body ? JSON.stringify(opties.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const fout = new Error((data && data.fout) || `Fout (${res.status})`);
    fout.status = res.status;
    throw fout;
  }
  return data;
}

async function huidigeGebruiker() {
  try {
    return await api('/auth/me');
  } catch {
    return null;
  }
}

async function vereisAanmelding(toegestaneRollen) {
  const user = await huidigeGebruiker();
  if (!user) {
    window.location.href = '/';
    return null;
  }
  if (toegestaneRollen && !toegestaneRollen.includes(user.rol)) {
    window.location.href = rolStartpagina(user.rol);
    return null;
  }
  return user;
}

function rolStartpagina(rol) {
  if (rol === 'bestuursondersteuning') return '/dashboard';
  if (rol === 'schepen') return '/schepen';
  return '/raadslid';
}

function formatteerDatum(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function toonMelding(elementId, tekst, type = 'fout') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = tekst;
  el.className = `melding ${type}`;
  el.classList.remove('verborgen');
  if (type === 'succes') setTimeout(() => el.classList.add('verborgen'), 4000);
}

function verbergMelding(elementId) {
  document.getElementById(elementId)?.classList.add('verborgen');
}

const ROL_LABELS = {
  bestuursondersteuning: 'Bestuursondersteuning',
  schepen: 'Schepen / kabinet',
  raadslid: 'Gemeenteraadslid',
};

function bouwZijbalk(actievePagina, user) {
  const links = {
    bestuursondersteuning: [
      ['dashboard', 'Afspraken'],
      ['werknota', 'Werknota\'s'],
      ['beheer', 'Beheer'],
    ],
    schepen: [['schepen', 'Mijn afspraken']],
    raadslid: [['raadslid', 'Alle afspraken']],
  };
  const items = links[user.rol] || [];
  const nav = items
    .map(
      ([href, label]) =>
        `<a href="/${href}" class="${actievePagina === href ? 'actief' : ''}">${label}</a>`,
    )
    .join('');

  return `
    <aside class="zijbalk">
      <div class="logo">Afspraken commissies</div>
      <div class="subtitel">Opvolging afspraken gemeenteraadscommissies</div>
      <nav>${nav}</nav>
      <div class="gebruiker-info">
        <div class="naam">${escapeHtml(user.naam)}</div>
        <div>${ROL_LABELS[user.rol] || user.rol}</div>
        <button id="btn-afmelden">Afmelden</button>
      </div>
    </aside>
  `;
}

function koppelAfmeldknop() {
  document.getElementById('btn-afmelden')?.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

function escapeHtml(tekst) {
  const div = document.createElement('div');
  div.textContent = tekst ?? '';
  return div.innerHTML;
}
