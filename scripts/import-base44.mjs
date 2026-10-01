#!/usr/bin/env node
// Imports your Base44 data into Supabase from the command line. (The same import is on the
// app's Import page, which most people should use instead.)
//
// 1. In Base44, export each data table (Data -> table -> Export) as CSV or JSON and put the
//    files in one folder, named after the table: Transaction.csv, User.csv, ...
// 2. From the project folder, after `npm install`:
//      SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-base44.mjs ./base44-export
//    Add --no-files to skip copying files off Base44, --dry-run to only list what's there.
//
// Keeps every record's id and dates; creates logins for users (no password: they use
// "Email me a sign-in link" or "Forgot password"); copies files off Base44 (deal documents
// and chat files into private storage). Safe to re-run.

import fs from 'node:fs';
import path from 'node:path';
import { readBase44File } from '../shared/importers.js';
import { importBase44Batch } from '../server/lib/importers.js';
import { SCHEMA } from '../src/api/schema.generated.js';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const DRY = args.includes('--dry-run');
const COPY = !args.includes('--no-files');
if (!dir) { console.error('Usage: node scripts/import-base44.mjs <export folder> [--no-files] [--dry-run]'); process.exit(1); }
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.'); process.exit(1); }

const files = fs.readdirSync(dir).filter((f) => /\.(csv|json)$/i.test(f));
const tableOf = (f) => {
  const base = f.replace(/\.(csv|json)$/i, ''); const lead = (base.match(/^[A-Za-z0-9]+/) || [''])[0];
  return Object.keys(SCHEMA).find((k) => k.toLowerCase() === base.toLowerCase()) || Object.keys(SCHEMA).find((k) => k.toLowerCase() === lead.toLowerCase()) || base;
};
const ordered = files.sort((a, b) => (tableOf(a) === 'User' ? -1 : tableOf(b) === 'User' ? 1 : tableOf(a) === 'Brokerage' ? -1 : tableOf(b) === 'Brokerage' ? 1 : a.localeCompare(b)));
const actor = { role: 'super_admin', email: 'import@cli' };
const failed = []; const privateFiles = new Set();
for (const f of ordered) {
  const entity = tableOf(f);
  const rows = readBase44File(f, fs.readFileSync(path.join(dir, f), 'utf8'));
  if (DRY) { console.log(`${entity}: ${rows.length} records${SCHEMA[entity] || entity === 'User' ? '' : ' (no matching table)'}`); continue; }
  let done = 0; let imported = 0; let copied = 0;
  while (done < rows.length) {
    const r = await importBase44Batch({ entity, rows: rows.slice(done, done + 100), brokerageId: null, actor, copyFiles: COPY, deadline: Date.now() + 10 * 60 * 1000 });
    done += Math.max(1, r.processed); imported += r.imported; copied += r.copied;
    failed.push(...r.failedFiles); r.privateBase44.forEach((p) => privateFiles.add(p)); r.notes.forEach((n) => console.log(`  ${n}`));
  }
  console.log(`${entity}: ${imported} of ${rows.length} imported${copied ? `, ${copied} files copied` : ''}`);
}
if (failed.length) { console.log(`\n${failed.length} files could not be copied:`); failed.slice(0, 50).forEach((x) => console.log(`  ${x}`)); }
if (privateFiles.size) { console.log(`\n${privateFiles.size} private Base44 files need downloading from Base44 by hand:`); [...privateFiles].slice(0, 50).forEach((x) => console.log(`  ${x}`)); }
console.log('\nDone.');
