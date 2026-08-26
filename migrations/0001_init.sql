-- Afspraken commissies - initieel schema

CREATE TABLE organen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  naam TEXT NOT NULL,
  emails TEXT NOT NULL DEFAULT '', -- kommagescheiden bestemmelingen (bv. secretariaat gemeenteraad)
  actief INTEGER NOT NULL DEFAULT 1,
  aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE schepenen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  naam TEXT NOT NULL,
  emails TEXT NOT NULL DEFAULT '', -- kommagescheiden bestemmelingen (kabinet)
  actief INTEGER NOT NULL DEFAULT 1,
  aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  naam TEXT NOT NULL,
  wachtwoord_hash TEXT NOT NULL,
  wachtwoord_salt TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('bestuursondersteuning','schepen','raadslid')),
  schepen_id INTEGER REFERENCES schepenen(id) ON DELETE SET NULL,
  actief INTEGER NOT NULL DEFAULT 1,
  aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE kalender_commissies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orgaan_id INTEGER REFERENCES organen(id) ON DELETE SET NULL,
  datum TEXT NOT NULL, -- ISO datum
  titel TEXT NOT NULL,
  sharepoint_item_id TEXT UNIQUE,
  opmerking TEXT NOT NULL DEFAULT '',
  aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now')),
  gewijzigd_op TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE werknotas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kalender_id INTEGER REFERENCES kalender_commissies(id) ON DELETE SET NULL,
  bestandsnaam TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  geupload_door INTEGER REFERENCES users(id) ON DELETE SET NULL,
  geupload_op TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'in_review' CHECK (status IN ('in_review','verwerkt'))
);

CREATE TABLE afspraken_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  werknota_id INTEGER NOT NULL REFERENCES werknotas(id) ON DELETE CASCADE,
  agendapunt TEXT NOT NULL DEFAULT '',
  omschrijving TEXT NOT NULL DEFAULT '',
  schepen_suggestie TEXT NOT NULL DEFAULT '',
  gevraagd_door TEXT NOT NULL DEFAULT '',
  ruwe_data TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'nieuw' CHECK (status IN ('nieuw','goedgekeurd','genegeerd')),
  aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE afspraken (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  werknota_id INTEGER REFERENCES werknotas(id) ON DELETE SET NULL,
  kalender_id INTEGER REFERENCES kalender_commissies(id) ON DELETE SET NULL,
  orgaan_id INTEGER REFERENCES organen(id) ON DELETE SET NULL,
  schepen_id INTEGER REFERENCES schepenen(id) ON DELETE SET NULL,
  agendapunt TEXT NOT NULL DEFAULT '',
  omschrijving TEXT NOT NULL DEFAULT '',
  gevraagd_door TEXT NOT NULL DEFAULT '', -- naam gemeenteraadslid (vrije tekst)
  datum_commissie TEXT, -- ISO datum
  deadline TEXT, -- ISO datum, optioneel
  is_beantwoord INTEGER NOT NULL DEFAULT 0,
  beantwoord_op TEXT,
  msg_r2_key TEXT,
  msg_bestandsnaam TEXT,
  eindmail_verstuurd INTEGER NOT NULL DEFAULT 0,
  eindmail_verstuurd_op TEXT,
  aantal_herinneringen INTEGER NOT NULL DEFAULT 0,
  laatste_herinnering_op TEXT,
  notitie TEXT NOT NULL DEFAULT '',
  aangemaakt_door INTEGER REFERENCES users(id) ON DELETE SET NULL,
  aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now')),
  gewijzigd_op TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE herinneringen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  afspraak_id INTEGER NOT NULL REFERENCES afspraken(id) ON DELETE CASCADE,
  volgnummer INTEGER NOT NULL,
  ontvangers TEXT NOT NULL,
  verzonden_door INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verzonden_op TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessies (
  id TEXT PRIMARY KEY, -- willekeurige token (hash wordt niet apart bewaard, token = id)
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verloopt_op TEXT NOT NULL,
  aangemaakt_op TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_afspraken_schepen ON afspraken(schepen_id);
CREATE INDEX idx_afspraken_orgaan ON afspraken(orgaan_id);
CREATE INDEX idx_afspraken_beantwoord ON afspraken(is_beantwoord);
CREATE INDEX idx_kalender_datum ON kalender_commissies(datum);
CREATE INDEX idx_sessies_user ON sessies(user_id);
CREATE INDEX idx_staging_werknota ON afspraken_staging(werknota_id);
