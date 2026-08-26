(async () => {
  const user = await vereisAanmelding(['raadslid']);
  if (!user) return;
  document.getElementById('app-shell').insertAdjacentHTML('afterbegin', bouwZijbalk('raadslid', user));
  koppelAfmeldknop();

  const data = await api('/afspraken');
  const open = data.filter((a) => !a.is_beantwoord);
  const beantwoord = data.filter((a) => a.is_beantwoord);
  document.getElementById('teller-open').textContent = open.length;
  document.getElementById('teller-beantwoord').textContent = beantwoord.length;

  $('#tabel-open').DataTable({
    data: open.map((a) => ({
      datum: formatteerDatum(a.datum_commissie),
      orgaan: escapeHtml(a.orgaan_naam || '-'),
      agendapunt: escapeHtml(a.agendapunt || '-'),
      omschrijving: `<div style="max-width:300px; white-space:normal;">${escapeHtml(a.omschrijving)}</div>`,
      schepen: escapeHtml(a.schepen_naam || '-'),
      gevraagdDoor: escapeHtml(a.gevraagd_door || '-'),
      deadline: formatteerDatum(a.deadline) || '-',
    })),
    columns: [
      { data: 'datum' }, { data: 'orgaan' }, { data: 'agendapunt' }, { data: 'omschrijving' },
      { data: 'schepen' }, { data: 'gevraagdDoor' }, { data: 'deadline' },
    ],
    order: [[0, 'desc']],
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.11/i18n/nl-NL.json' },
    pageLength: 25,
  });

  $('#tabel-beantwoord').DataTable({
    data: beantwoord.map((a) => ({
      datum: formatteerDatum(a.datum_commissie),
      orgaan: escapeHtml(a.orgaan_naam || '-'),
      agendapunt: escapeHtml(a.agendapunt || '-'),
      omschrijving: `<div style="max-width:300px; white-space:normal;">${escapeHtml(a.omschrijving)}</div>`,
      schepen: escapeHtml(a.schepen_naam || '-'),
      beantwoordOp: formatteerDatum(a.beantwoord_op),
      antwoord: a.msg_bestandsnaam
        ? `<a href="/api/afspraken/${a.id}/msg" target="_blank" rel="noopener">${escapeHtml(a.msg_bestandsnaam)}</a>`
        : '-',
    })),
    columns: [
      { data: 'datum' }, { data: 'orgaan' }, { data: 'agendapunt' }, { data: 'omschrijving' },
      { data: 'schepen' }, { data: 'beantwoordOp' }, { data: 'antwoord' },
    ],
    order: [[0, 'desc']],
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.11/i18n/nl-NL.json' },
    pageLength: 25,
  });
})();
