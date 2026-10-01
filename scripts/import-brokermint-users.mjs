#!/usr/bin/env node
// Imports users from a Brokermint CSV export (Settings -> Users -> export) from the command
// line. (The same import is on the app's Import page, which most people should use instead.)
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-brokermint-users.mjs users.csv --brokerage <brokerage id> [--invite] [--dry-run]
//
// Creates a login for each person (with --invite they get an email to set a password),
// copies role, phone, birthday, anniversary (cap year start), team, address, annual cap,
// up to 4 state licenses, their TC, and the recruiter ("Downline" in Brokermint) for
// revenue share. Teams are created as needed. Re-running updates people instead of duplicating.

import fs from 'node:fs';
import { parseCsv, brokermintPerson } from '../shared/importers.js';
import { importPeople, linkPeople } from '../server/lib/importers.js';

const args = process.argv.slice(2);
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--brokerage');
const brokerage = args[args.indexOf('--brokerage') + 1];
if (!file || args.indexOf('--brokerage') < 0 || !brokerage) { console.error('Usage: node scripts/import-brokermint-users.mjs users.csv --brokerage <brokerage id> [--invite] [--dry-run]'); process.exit(1); }
const people = parseCsv(fs.readFileSync(file, 'utf8')).rows.map(brokermintPerson).filter((p) => p.email);
console.log(`${people.length} people in ${file}`);
if (args.includes('--dry-run')) { people.forEach((p) => console.log(`${p.name} <${p.email}> ${p.profile.role || '(keeps current role)'}${p.teamName ? ` team: ${p.teamName}` : ''}`)); process.exit(0); }
const actor = { role: 'super_admin', email: 'import@cli' };
for (let i = 0; i < people.length; i += 25) {
  for (const r of await importPeople({ people: people.slice(i, i + 25), brokerageId: brokerage, invite: args.includes('--invite'), actor })) {
    console.log(`${r.ok ? 'ok ' : '!! '}${r.email}${r.ok ? `  ${r.role}${r.team ? `  team: ${r.team}` : ''}` : `  ${r.error}`}`);
  }
}
const { linked, missing } = await linkPeople({ links: people.map((p) => ({ email: p.email, recruiter: p.recruiter, tcName: p.tcName })), brokerageId: brokerage });
missing.forEach((m) => console.log(`  ? ${m}`));
console.log(`\nDone. ${people.length} people, ${linked} recruiter/TC links.`);
