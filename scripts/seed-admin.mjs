#!/usr/bin/env node
// Genereert het SQL-commando om de allereerste bestuursondersteuning-gebruiker
// aan te maken (er is nog geen enkele gebruiker, dus dit kan niet via de app zelf).
//
// Gebruik:
//   node scripts/seed-admin.mjs "naam@gent.be" "Voornaam Achternaam" "eenSterkWachtwoord123"
//
// Het script print een `wrangler d1 execute`-commando dat je vervolgens zelf
// uitvoert (lokaal met --local, of op productie zonder --local).

import { webcrypto as crypto } from 'node:crypto';

const [, , email, naam, wachtwoord] = process.argv;
if (!email || !naam || !wachtwoord) {
  console.error('Gebruik: node scripts/seed-admin.mjs <email> <naam> <wachtwoord>');
  process.exit(1);
}
if (wachtwoord.length < 8) {
  console.error('Wachtwoord moet minstens 8 tekens bevatten.');
  process.exit(1);
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(wachtwoord), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, keyMaterial, 256);

const hashHex = toHex(bits);
const saltHex = toHex(salt);
const emailEsc = email.trim().toLowerCase().replace(/'/g, "''");
const naamEsc = naam.trim().replace(/'/g, "''");

const sql = `INSERT INTO users (email, naam, wachtwoord_hash, wachtwoord_salt, rol) VALUES ('${emailEsc}', '${naamEsc}', '${hashHex}', '${saltHex}', 'bestuursondersteuning');`;

console.log('\nVoer dit uit om de eerste admin-gebruiker aan te maken:\n');
console.log(`  npx wrangler d1 execute afspraken_commissies_db --local --command "${sql}"`);
console.log('\nOf op productie (na deploy):\n');
console.log(`  npx wrangler d1 execute afspraken_commissies_db --remote --command "${sql}"`);
console.log('');
