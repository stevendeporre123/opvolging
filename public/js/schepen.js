(async () => {
  const user = await vereisAanmelding(['schepen']);
  if (!user) return;
  document.getElementById('app-shell').insertAdjacentHTML('afterbegin', bouwZijbalk('schepen', user));
  koppelAfmeldknop();

  const data = await api('/afspraken');
  const open = data.filter((a) => !a.is_beantwoord);
  const beantwoord = data.filter((a) => a.is_beantwoord);

  $('#tabel-open').DataTable({
    data: open.map((a) => ({
      datum: formatteerDatum(a.datum_commissie),
      orgaan: escapeHtml(a.orgaan_naam || '-'),
      agendapunt: escapeHtml(a.agendapunt || '-'),
      omschrijving: `<div style="max-width:340px; white-space:normal;">${escapeHtml(a.omschrijving)}</div>`,
      gevraagdDoor: escapeHtml(a.gevraagd_door || '-'),
      deadline: formatteerDatum(a.deadline) || '-',
      herinneringen: `${a.aantal_herinneringen}/3`,
    })),
    columns: [
      { data: 'datum' }, { data: 'orgaan' }, { data: 'agendapunt' }, { data: 'omschrijving' },
      { data: 'gevraagdDoor' }, { data: 'deadline' }, { data: 'herinneringen' },
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
      omschrijving: `<div style="max-width:340px; white-space:normal;">${escapeHtml(a.omschrijving)}</div>`,
      beantwoordOp: formatteerDatum(a.beantwoord_op),
    })),
    columns: [
      { data: 'datum' }, { data: 'orgaan' }, { data: 'agendapunt' }, { data: 'omschrijving' }, { data: 'beantwoordOp' },
    ],
    order: [[0, 'desc']],
    language: { url: 'https://cdn.datatables.net/plug-ins/1.13.11/i18n/nl-NL.json' },
    pageLength: 10,
  });
})();
