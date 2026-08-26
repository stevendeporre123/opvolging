import JSZip from 'jszip';

export interface GeextraheerdeAfspraak {
  agendapunt: string;
  omschrijving: string;
  schepen_suggestie: string;
  gevraagd_door: string;
  ruwe_data: Record<string, unknown>;
}

const HEADER_KEYWORDS: Record<string, string[]> = {
  agendapunt: ['agendapunt', 'punt', 'onderwerp', 'dossier'],
  omschrijving: ['afspraak', 'vraag', 'actie', 'op te volgen', 'te bezorgen', 'toelichting', 'antwoord'],
  schepen: ['schepen', 'bevoegde'],
  gevraagd_door: ['raadslid', 'gemeenteraadslid', 'gevraagd door', 'gesteld door', 'fractie'],
};

function stripXmlTags(fragment: string): string {
  // Vervang alinea/tab-breaks door leesbare whitespace, verwijder de rest van de tags.
  return fragment
    .replace(/<w:tab\b[^/]*\/>/g, '\t')
    .replace(/<w:br\b[^/]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function extractText(xmlFragment: string): string {
  const matches = [...xmlFragment.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)];
  if (matches.length === 0) return '';
  return matches.map((m) => m[1]).join('').trim();
}

function splitByTag(xml: string, tag: string): string[] {
  // Eenvoudige (niet-geneste) matching: voldoende voor w:tbl/w:tr/w:tc/w:p in
  // een OOXML document.xml, die in de praktijk niet in zichzelf nesten.
  const results: string[] = [];
  const regex = new RegExp(`<w:${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/w:${tag}>`, 'g');
  const matches = xml.match(regex);
  if (matches) results.push(...matches);
  return results;
}

function classifyHeaderCell(text: string): keyof typeof HEADER_KEYWORDS | null {
  const lower = text.toLowerCase();
  for (const [key, keywords] of Object.entries(HEADER_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return key as keyof typeof HEADER_KEYWORDS;
  }
  return null;
}

function parseTable(tableXml: string): GeextraheerdeAfspraak[] {
  const rows = splitByTag(tableXml, 'tr');
  if (rows.length === 0) return [];

  const rowCells = rows.map((rowXml) => splitByTag(rowXml, 'tc').map((cellXml) => extractText(cellXml)));

  // Bepaal of eerste rij een herkenbare header is.
  const headerMap: Record<number, keyof typeof HEADER_KEYWORDS> = {};
  const firstRow = rowCells[0] ?? [];
  firstRow.forEach((cellText, i) => {
    const cls = classifyHeaderCell(cellText);
    if (cls) headerMap[i] = cls;
  });
  const heeftHeader = Object.keys(headerMap).length > 0;
  const dataRows = heeftHeader ? rowCells.slice(1) : rowCells;

  const resultaten: GeextraheerdeAfspraak[] = [];
  for (const cells of dataRows) {
    if (cells.every((c) => !c.trim())) continue;
    const afspraak: GeextraheerdeAfspraak = {
      agendapunt: '',
      omschrijving: '',
      schepen_suggestie: '',
      gevraagd_door: '',
      ruwe_data: { cellen: cells },
    };
    if (heeftHeader) {
      cells.forEach((text, i) => {
        const veld = headerMap[i];
        if (veld === 'agendapunt') afspraak.agendapunt = afspraak.agendapunt ? `${afspraak.agendapunt} ${text}` : text;
        else if (veld === 'omschrijving') afspraak.omschrijving = afspraak.omschrijving ? `${afspraak.omschrijving} ${text}` : text;
        else if (veld === 'schepen') afspraak.schepen_suggestie = text;
        else if (veld === 'gevraagd_door') afspraak.gevraagd_door = text;
      });
      // Kolommen zonder herkende header toevoegen aan omschrijving als extra context.
      if (!afspraak.omschrijving) {
        const overige = cells.filter((_, i) => headerMap[i] === undefined).join(' — ');
        afspraak.omschrijving = overige;
      }
    } else {
      // Geen herkenbare kolommen: eerste cel als agendapunt, rest als omschrijving.
      afspraak.agendapunt = cells[0] ?? '';
      afspraak.omschrijving = cells.slice(1).join(' — ');
    }
    if (afspraak.agendapunt || afspraak.omschrijving) resultaten.push(afspraak);
  }
  return resultaten;
}

/**
 * Best-effort extractie van afspraken uit een werknota (.docx). Elke gevonden
 * tabel wordt geïnterpreteerd; rijen zonder herkenbare kolomkoppen worden ook
 * meegenomen maar blijven, net als alle andere resultaten, in de staging-tabel
 * tot een medewerker van bestuursondersteuning ze goedkeurt.
 */
export async function extractAfsprakenFromDocx(buffer: ArrayBuffer): Promise<GeextraheerdeAfspraak[]> {
  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) throw new Error('Geen geldig .docx bestand (word/document.xml ontbreekt).');
  const xml = await docXmlFile.async('text');

  const tables = splitByTag(xml, 'tbl');
  let resultaten: GeextraheerdeAfspraak[] = [];
  for (const tableXml of tables) {
    resultaten = resultaten.concat(parseTable(tableXml));
  }

  if (resultaten.length === 0) {
    // Fallback: geen tabellen gevonden, zoek paragrafen met een "Afspraak:"-achtig label.
    const paragraphs = splitByTag(xml, 'p').map((p) => extractText(p)).filter(Boolean);
    let huidigAgendapunt = '';
    for (const tekst of paragraphs) {
      const labelMatch = tekst.match(/^(afspraak|actie|op te volgen|te bezorgen)\s*:\s*(.+)$/i);
      if (labelMatch) {
        resultaten.push({
          agendapunt: huidigAgendapunt,
          omschrijving: labelMatch[2].trim(),
          schepen_suggestie: '',
          gevraagd_door: '',
          ruwe_data: { paragraaf: tekst },
        });
      } else if (tekst.length < 200) {
        huidigAgendapunt = tekst;
      }
    }
  }

  return resultaten;
}
