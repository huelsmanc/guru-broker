#!/usr/bin/env node
// Imports your Base44 data into Supabase.
//
// 1. In Base44, export each data table (Data -> table -> Export) as CSV or JSON and put
//    the files in one folder, named after the table: Transaction.csv, User.csv, ...
// 2. Run (from the project folder, after `npm install`):
//      SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-base44.mjs ./base44-export --copy-files
//    Add --dry-run first to see what would happen without writing anything.
//
// What it does
// - Keeps every record's id and dates, so links between records still work.
// - Users: creates a login for each (no password; they use "Email me a sign-in link" or
//   "Forgot password" the first time), copies role, brokerage and profile fields, and
//   updates records that pointed at their old Base44 user id.
// - --copy-files: downloads files stored on Base44 and re-uploads them to your Supabase
//   storage, then rewrites the links, so nothing depends on Base44 any more.
// - Safe to re-run: records are upserted by id.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { SCHEMA } from '../src/api/schema.generated.js';

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const DRY = args.includes('--dry-run');
const COPY = args.includes('--copy-files');
if (!dir) {
  console.error('Usage: node scripts/import-base44.mjs <export folder> [--copy-files] [--dry-run]');
  process.exit(1);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Reading exports

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

function readTable(entity) {
  for (const ext of ['json', 'csv']) {
    const f = path.join(dir, `${entity}.${ext}`);
    if (!fs.existsSync(f)) continue;
    const text = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');
    const rows = ext === 'json' ? JSON.parse(text) : parseCsv(text);
    return (Array.isArray(rows) ? rows : rows.data || rows.items || []).map(cleanValues);
  }
  return null;
}

// CSV cells hold JSON for arrays/objects and text for everything else.
function cleanValues(r) {
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v !== 'string') { out[k] = v; continue; }
    const t = v.trim();
    if (t === '') { out[k] = null; continue; }
    if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
      try { out[k] = JSON.parse(t); continue; } catch { /* keep as text */ }
    }
    if (t === 'true' || t === 'false') { out[k] = t === 'true'; continue; }
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Files hosted by Base44

const fileMap = new Map();
const privateFiles = [];
const isBase44File = (s) => typeof s === 'string' && /^https?:\/\//.test(s) && /base44/i.test(s);

async function rehost(url) {
  if (fileMap.has(url)) return fileMap.get(url);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
    const key = `imported/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
    if (!DRY) {
      const { error } = await db.storage.from('public-files').upload(key, bytes, { contentType: res.headers.get('content-type') || undefined });
      if (error) throw new Error(error.message);
    }
    const newUrl = db.storage.from('public-files').getPublicUrl(key).data.publicUrl;
    fileMap.set(url, newUrl);
    return newUrl;
  } catch (err) {
    console.warn(`  ! could not copy ${url}: ${err.message}`);
    fileMap.set(url, url);
    return url;
  }
}

async function walkFiles(value) {
  if (isBase44File(value)) return rehost(value);
  if (typeof value === 'string' && value.startsWith('/') && /\.(pdf|png|jpe?g|docx?)$/i.test(value)) privateFiles.push(value);
  if (Array.isArray(value)) return Promise.all(value.map(walkFiles));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await walkFiles(v);
    return out;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Rows

const SYSTEM = ['id', 'created_date', 'updated_date', 'created_by'];
const USER_REFS = ['agent_id', 'sender_id', 'receiver_id', 'account_owner_id', 'user_id', 'to_id', 'from_id'];
const DROP = new Set(['openai_api_key']); // secrets never belong in shared tables

function toRow(entity, rec, userIdMap) {
  const def = SCHEMA[entity];
  const cols = new Set(def.columns);
  const typed = new Set(def.typed || []);
  const row = { extra: {} };
  for (const [k, v0] of Object.entries(rec)) {
    if (DROP.has(k)) continue;
    let v = v0;
    if (USER_REFS.includes(k) && userIdMap.has(v)) v = userIdMap.get(v);
    if (cols.has(k)) row[k] = v === '' && typed.has(k) ? null : v;
    else if (!k.startsWith('_')) row.extra[k] = v;
  }
  for (const k of SYSTEM) if (rec[k] == null) delete row[k];
  return row;
}

async function upsert(table, rows) {
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    if (DRY) continue;
    const { error } = await db.from(table).upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Users

async function importUsers() {
  const users = readTable('User');
  const map = new Map();
  if (!users) { console.log('User: no export found, skipping'); return map; }
  console.log(`User: ${users.length} records`);
  const { data: existing } = DRY ? { data: { users: [] } } : await db.auth.admin.listUsers({ perPage: 1000 });
  const byEmail = new Map((existing?.users || []).map((u) => [u.email?.toLowerCase(), u]));
  for (const u0 of users) {
    const u = COPY ? await walkFiles(u0) : u0;
    const email = String(u.email || '').toLowerCase().trim();
    if (!email) continue;
    let authUser = byEmail.get(email);
    if (!authUser && !DRY) {
      const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: u.full_name || '' } });
      if (error) { console.warn(`  ! ${email}: ${error.message}`); continue; }
      authUser = data.user;
    }
    const newId = authUser?.id || `dry-${email}`;
    if (u.id) map.set(u.id, newId);
    const { id, created_by, ...rest } = u;
    const row = toRow('User', rest, new Map());
    row.extra = { ...row.extra, legacy_id: u.id };
    delete row.email;
    if (!DRY) {
      const { error } = await db.from('profiles').update(row).eq('id', newId);
      if (error) console.warn(`  ! profile ${email}: ${error.message}`);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------

const ORDER = ['Brokerage', 'BrokerageSettings'];
const entities = Object.keys(SCHEMA).filter((e) => e !== 'User');
entities.sort((a, b) => (ORDER.indexOf(b) - ORDER.indexOf(a)) || a.localeCompare(b));

console.log(`${DRY ? '[dry run] ' : ''}Importing from ${path.resolve(dir)}${COPY ? ' (copying files)' : ''}\n`);
const userIdMap = await importUsers();
for (const entity of entities) {
  const recs = readTable(entity);
  if (!recs) continue;
  const rows = [];
  for (const r of recs) rows.push(toRow(entity, COPY ? await walkFiles(r) : r, userIdMap));
  await upsert(SCHEMA[entity].table, rows);
  console.log(`${entity}: ${rows.length} records`);
}
const unknown = fs.readdirSync(dir).map((f) => f.replace(/\.(csv|json)$/i, '')).filter((n) => n !== 'User' && !SCHEMA[n]);
if (unknown.length) console.log(`\nNot imported (no matching table): ${unknown.join(', ')}`);
if (COPY) console.log(`\nCopied ${[...fileMap].filter(([from, to]) => from !== to).length} files from Base44.`);
if (privateFiles.length) {
  console.log(`\n${new Set(privateFiles).size} private Base44 files could not be downloaded automatically (they need Base44's API).`);
  console.log('Download them from Base44 and re-upload in the app, or send the list to your developer:');
  for (const f of new Set(privateFiles)) console.log(`  ${f}`);
}
console.log('\nDone.');
