#!/usr/bin/env node
// Imports users from a Brokermint CSV export (Settings -> Users -> export).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-brokermint-users.mjs users.csv --brokerage <brokerage id> [--invite] [--dry-run]
//
// - Creates a login for each user (with --invite they get an email to set a password;
//   without it they use "Email me a sign-in link" the first time).
// - Copies role, phone, birthday, anniversary (cap year start), team, address, TC,
//   annual cap, up to 4 state licenses, and the recruiter ("Downline" column in
//   Brokermint = who recruited this person) for revenue share.
// - Teams are created as needed. Re-running updates people instead of duplicating them.
// Column names are matched loosely, so small differences in the export are fine.

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--brokerage');
const brokerage = args[args.indexOf('--brokerage') + 1];
const DRY = args.includes('--dry-run');
const INVITE = args.includes('--invite');
if (!file || !brokerage || args.indexOf('--brokerage') < 0) {
  console.error('Usage: node scripts/import-brokermint-users.mjs users.csv --brokerage <brokerage id> [--invite] [--dry-run]');
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function parseCsv(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows;
  const keys = head.map((h) => h.trim().toLowerCase().replace(/[^a-z0-9#()]+/g, ' ').trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const pick = (r, ...names) => { for (const n of names) { const v = r[n]; if (v) return v; } return ''; };
const date = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const money = (v) => (v ? Number(String(v).replace(/[^0-9.]/g, '')) || null : null);
const ROLE = {
  'team leader': 'team_leader', tc: 'tc', 'transaction coordinator': 'tc', owner: 'owner', broker: 'broker',
  'office administrator': 'office_admin', admin: 'office_admin', agent: 'agent',
};

const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
console.log(`${DRY ? '[dry run] ' : ''}${rows.length} users in ${file}\n`);

const { data: existingAuth } = DRY ? { data: { users: [] } } : await db.auth.admin.listUsers({ perPage: 1000 });
const byEmail = new Map((existingAuth?.users || []).map((u) => [u.email.toLowerCase(), u]));
const teams = new Map();
if (!DRY) {
  const { data } = await db.from('team').select('*').eq('brokerage_id', brokerage);
  for (const t of data || []) teams.set(t.name.toLowerCase(), t);
}
const people = [];

for (const r of rows) {
  const email = pick(r, 'email', 'e mail').toLowerCase();
  if (!email) continue;
  const first = pick(r, 'first name'); const last = pick(r, 'last name');
  const name = pick(r, 'name', 'full name') || `${first} ${last}`.trim();
  const licenses = [];
  for (const n of ['', ' (2)', ' (3)', ' (4)']) {
    const st = pick(r, `state of licensure${n}`); const num = pick(r, `license #${n}`, `license${n}`);
    const exp = date(pick(r, `license expiration${n}`));
    if ((st && st !== 'not selected') || num) licenses.push({ state: st === 'not selected' ? '' : st, number: num, expiration: exp });
  }
  const teamName = pick(r, 'team');
  const profile = {
    first_name: first || null, last_name: last || null, full_name: name, display_name: name,
    role: ROLE[pick(r, 'role').toLowerCase()] || 'agent',
    phone: pick(r, 'phone') || null, personal_company: pick(r, 'personal company') || null,
    birthday: date(pick(r, 'birthday')), start_date: date(pick(r, 'anniversary date', 'anniversary')),
    address: pick(r, 'address') || null, city: pick(r, 'city') || null, state: pick(r, 'state') || null, zip: pick(r, 'zip') || null,
    alternate_name: pick(r, 'alternate name') || null,
    annual_cap: money(pick(r, 'annual cap')),
    license_state: licenses[0]?.state || null, license_number: licenses[0]?.number || null, license_expiration: licenses[0]?.expiration || null,
    licenses, brokerage_id: brokerage,
    suspended: /inactive|disabled/i.test(pick(r, 'status', 'active')) ? true : false,
  };
  people.push({ email, name, profile, teamName, recruiter: pick(r, 'downline', 'recruited by', 'sponsor'), tcName: pick(r, 'tc') });
}

// Create logins and profiles
for (const p of people) {
  let user = byEmail.get(p.email);
  if (!user && !DRY) {
    const res = INVITE
      ? await db.auth.admin.inviteUserByEmail(p.email, { data: { full_name: p.name } })
      : await db.auth.admin.createUser({ email: p.email, email_confirm: true, user_metadata: { full_name: p.name } });
    if (res.error) { console.warn(`  ! ${p.email}: ${res.error.message}`); continue; }
    user = res.data.user;
  }
  p.id = user?.id;
  if (p.teamName && !teams.has(p.teamName.toLowerCase()) && !DRY) {
    const { data } = await db.from('team').insert({ brokerage_id: brokerage, name: p.teamName }).select('*').single();
    teams.set(p.teamName.toLowerCase(), data);
  }
  if (!DRY && p.id) {
    const team = p.teamName ? teams.get(p.teamName.toLowerCase()) : null;
    const { error } = await db.from('profiles').update({ ...p.profile, team_id: team?.id || null }).eq('id', p.id);
    if (error) console.warn(`  ! profile ${p.email}: ${error.message}`);
    if (team && p.profile.role === 'team_leader' && !team.leader_email) {
      await db.from('team').update({ leader_email: p.email }).eq('id', team.id);
      team.leader_email = p.email;
    }
  }
  console.log(`${p.name} <${p.email}>  ${p.profile.role}${p.teamName ? `  team: ${p.teamName}` : ''}`);
}

// Recruiters and TCs are given by name; match them to emails.
const byName = new Map(people.map((p) => [p.name.toLowerCase(), p.email]));
let linked = 0;
for (const p of people) {
  const patch = {};
  const rec = p.recruiter && byName.get(p.recruiter.toLowerCase());
  if (rec && rec !== p.email) patch.sponsor_email = rec;
  const tc = p.tcName && !/^n\/?a$/i.test(p.tcName) && byName.get(p.tcName.toLowerCase());
  if (tc) patch.tc_email = tc;
  if (p.recruiter && !rec) console.warn(`  ? ${p.name}: recruiter "${p.recruiter}" not found among imported users`);
  if (Object.keys(patch).length && !DRY && p.id) { await db.from('profiles').update(patch).eq('id', p.id); linked++; }
}
console.log(`\nDone. ${people.length} users, ${teams.size} teams, ${linked} recruiter/TC links.`);
