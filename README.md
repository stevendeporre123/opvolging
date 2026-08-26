# Afspraken commissies

Beheertoepassing voor de opvolging van afspraken uit de werknota's van de
Gentse gemeenteraadscommissies. Gebouwd als Cloudflare Worker (Hono) met
D1 (database), R2 (bestandsopslag) en statische Workers Assets als
frontend (vanilla JS + DataTables, light theme, Poppins).

## Functionaliteit

- Werknota (.docx) opladen: afspraken worden automatisch gefilterd
  (tabellen in het document) en verschijnen als voorstel ter controle
  (staging). Pas na goedkeuring door bestuursondersteuning komen ze in de
  afsprakentabel.
- Volledige CRUD op afspraken door de dienst bestuursondersteuning.
- Herinneringsmails (max. 3) naar het kabinet van de betrokken schepen.
- Antwoorden komen binnen per mail; het .msg-bestand wordt manueel als
  bijlage toegevoegd aan de afspraak. Bij het vinkje "is beantwoord"
  vertrekt automatisch een mail naar het orgaan (gemeenteraad/commissie)
  met het .msg-bestand in bijlage.
- Helpertabellen: kalender commissies, schepenen, organen, afspraken.
- Read-only pagina per rol:
  - **Schepen/kabinet**: enkel eigen afspraken, met nadruk op wat nog niet
    beantwoord is.
  - **Raadslid**: alle afspraken, gegroepeerd op beantwoord/niet-beantwoord.
- Rolgebaseerde toegang: `bestuursondersteuning` (volledige toegang),
  `schepen` (alleen-lezen, eigen afspraken), `raadslid` (alleen-lezen, alles).

## Techstack

| Onderdeel        | Keuze                                                        |
|-------------------|--------------------------------------------------------------|
| Runtime/backend   | Cloudflare Workers + [Hono](https://hono.dev)                |
| Database          | Cloudflare D1 (SQLite)                                       |
| Bestandsopslag    | Cloudflare R2 (werknota's .docx, antwoorden .msg)             |
| Frontend          | Statische Workers Assets, vanilla JS, jQuery + DataTables    |
| Auth              | Eigen sessie-auth (HttpOnly cookie, PBKDF2 wachtwoord-hash)  |
| E-mail            | [Resend](https://resend.com) API (vervangbaar, zie `src/lib/email.ts`) |

Alles draait op het gratis/betaalbare Cloudflare-platform, zoals gevraagd.

## Wat je zelf nog moet aansluiten

Dit is een werkende basis, maar drie zaken vereisen eigen accounts/config
die ik niet kan invullen:

1. **E-mail verzenden** - een `RESEND_API_KEY` (of herschrijf
   `src/lib/email.ts` naar een andere provider zoals Postmark/SendGrid).
   Zonder deze key wordt e-mail enkel gelogd, niet verstuurd - handig om
   eerst alles te testen zonder per ongeluk mails te versturen.
2. **SharePoint-kalender import** - er is geen directe Microsoft Graph
   OAuth-koppeling gebouwd (vereist app-registratie in Entra ID van de
   stad). In plaats daarvan is er een beveiligd webhook-endpoint
   (`POST /api/kalender/import`) dat je kan laten aanroepen door een Power
   Automate-flow op de SharePoint-lijst (trigger: item aangemaakt/gewijzigd).
   Zie hieronder voor het formaat.
3. **Domeinnaam/e-mailafzender** - pas `MAIL_AFZENDER` in `wrangler.toml`
   aan naar een adres op een domein dat je bij Resend hebt geverifieerd.

## Lokaal draaien

```bash
npm install
npx wrangler d1 create afspraken_commissies_db   # kopieer de database_id naar wrangler.toml
npx wrangler r2 bucket create afspraken-commissies-bestanden
npm run db:migrate:local
node scripts/seed-admin.mjs "jij@gent.be" "Jouw naam" "eenSterkWachtwoord123"
# voer het gegenereerde `wrangler d1 execute ... --local` commando uit
npm run dev
```

Open http://localhost:8787 en meld je aan met het zonet aangemaakte account.

## Deployen naar Cloudflare

```bash
npx wrangler login
npx wrangler d1 create afspraken_commissies_db     # eenmalig, zet database_id in wrangler.toml
npx wrangler r2 bucket create afspraken-commissies-bestanden   # eenmalig
npm run db:migrate:remote

npx wrangler secret put SESSION_SECRET          # lange willekeurige string (nu enkel gebruikt als reserve; sessies staan in D1)
npx wrangler secret put RESEND_API_KEY          # API key van resend.com
npx wrangler secret put SHAREPOINT_IMPORT_KEY   # zelf gekozen geheime sleutel voor de kalender-webhook

npm run deploy
```

Maak daarna de eerste gebruiker aan met `scripts/seed-admin.mjs` (zie
hierboven, met `--remote` i.p.v. `--local`). Vanaf dan kan die persoon via
**Beheer → Gebruikers** in de app zelf schepen- en raadslid-accounts
aanmaken (en verdere bestuursondersteuning-collega's).

Pas na deploy ook `APP_BASE_URL` in `wrangler.toml` aan naar je echte
`*.workers.dev`-adres (of custom domein) en herdeploy.

## SharePoint-kalenderimport (webhook)

`POST /api/kalender/import` met header `X-Import-Key: <SHAREPOINT_IMPORT_KEY>`
en body:

```json
{
  "items": [
    {
      "sharepoint_item_id": "123",
      "datum": "2026-09-15",
      "titel": "Commissie Algemene Zaken, Financiën en Stedenbouw",
      "orgaan_naam": "Commissie Algemene Zaken",
      "opmerking": ""
    }
  ]
}
```

Items worden gededupliceerd op `sharepoint_item_id`: bestaat het al, dan
wordt het bijgewerkt; anders wordt het aangemaakt. `orgaan_naam` wordt
gekoppeld aan een bestaand orgaan met exact diezelfde naam (beheer je
organen dus eerst via **Beheer → Organen**).

Een Power Automate-flow "Wanneer een item wordt aangemaakt of gewijzigd"
op je SharePoint-lijst kan dit rechtstreeks aanroepen met een HTTP-actie.

## Over de automatische extractie uit de werknota

Werknota's kunnen onderling verschillen in opmaak, dus de extractie is
bewust **best-effort**: het systeem zoekt tabellen in het .docx-bestand en
herkent kolommen op basis van trefwoorden (agendapunt, afspraak/vraag,
schepen, raadslid/fractie). Alles wat herkend wordt wordt als voorstel
getoond op de pagina **Werknota's**, waar bestuursondersteuning elk
voorstel controleert, desgewenst aanpast, en pas dan goedkeurt (of
negeert). Er wordt dus nooit automatisch iets rechtstreeks in de
afsprakentabel gezet - dat voorkomt dat een verkeerd herkende rij
ongemerkt een foute afspraak aanmaakt. Komt er weinig of niets uit een
document, dan kan de afspraak nog altijd manueel worden toegevoegd via
**Afspraken → Nieuwe afspraak**.

## Projectstructuur

```
src/
  index.ts              Hono-app, routing
  types.ts              Gedeelde TypeScript-types
  middleware/auth.ts     requireAuth / requireRole
  lib/auth.ts            Wachtwoord-hashing (PBKDF2) en sessies
  lib/docxParser.ts       Best-effort extractie van afspraken uit .docx
  lib/email.ts            E-mail versturen via Resend
  routes/                 auth, schepenen, organen, kalender, werknota, afspraken, users
migrations/0001_init.sql  D1-schema
public/                   Statische frontend (per rol een pagina + DataTables)
scripts/seed-admin.mjs    Eerste admin-gebruiker aanmaken
```

## Bekende beperkingen / mogelijke vervolgstappen

- De .docx-parser gebruikt geen volwaardige Word-parser (om binnen de
  Workers-runtime te blijven), maar een gerichte XML-extractie van
  tabellen. Documenten zonder tabellen vallen terug op een eenvoudige
  "Afspraak:"-paragraafherkenning. Bij een vast werknota-sjabloon kan de
  herkenning in `src/lib/docxParser.ts` verder verfijnd worden.
- Er is geen wachtwoord-vergeet-functionaliteit; een bestuursondersteuning-
  account kan wachtwoorden van andere gebruikers resetten via **Beheer →
  Gebruikers**.
- E-mailversturen en SharePoint-import vereisen de secrets hierboven.
