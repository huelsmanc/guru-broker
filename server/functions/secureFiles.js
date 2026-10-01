// New: moves deal documents, offers, onboarding paperwork and chat attachments that are still
// in public storage (earlier uploads and imports) into private folders, and updates the links.
// Run from Import -> "Make existing files private". Works through one table a page at a time.
// The old public copies are left in place (their links are long and unguessable); nothing new
// is ever stored publicly for these records.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { scopeFolder, storePrivate } from '../lib/files.js';
import { normalizeRole } from '../../shared/permissions.generated.js';

export const SECURE_TABLES = ['transaction', 'checklist', 'esign_document', 'offer', 'direct_message', 'group_message', 'social_message', 'thread_reply'];
const lc = (e) => String(e || '').toLowerCase();

function publicPath(url) {
  const base = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const prefix = `${base}/storage/v1/object/public/public-files/`;
  return typeof url === 'string' && base && url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length).split('?')[0]) : null;
}

export async function moveUrl(url, folder, cache) {
  const path = publicPath(url);
  if (!path) return url;
  if (cache.has(url)) return cache.get(url);
  const { data, error } = await adminClient().storage.from('public-files').download(path);
  if (error || !data) { cache.set(url, url); return url; }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const next = await storePrivate(folder, path.split('/').pop().replace(/^\d+-[0-9a-f-]{36}-/, ''), bytes, data.type || undefined);
  cache.set(url, next);
  return next;
}

async function moveInContent(content, folder, cache) {
  const c = String(content || '');
  for (const tag of ['[file]', '[voice_memo]']) {
    if (c.startsWith(tag)) {
      const [url, ...rest] = c.slice(tag.length).split('|');
      const next = await moveUrl(url, folder, cache);
      return next === url ? c : `${tag}${[next, ...rest].join('|')}`;
    }
  }
  return c;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!['owner', 'broker'].includes(normalizeRole(me.role)) && me.role !== 'super_admin') return Response.json({ error: 'Only the owner or broker can do this' }, { status: 403 });
    const { table = SECURE_TABLES[0], cursor = '' } = await req.json();
    if (!SECURE_TABLES.includes(table)) return Response.json({ error: 'Unknown table' }, { status: 400 });
    const db = adminClient();
    const b = me.brokerage_id;
    let q = db.from(table).select('*').order('id').limit(40);
    if (cursor) q = q.gt('id', cursor);
    if (b) q = q.eq('brokerage_id', b);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const cache = new Map();
    const people = new Map();
    const idOf = async (email) => {
      if (!people.has(lc(email))) people.set(lc(email), (await db.from('profiles').select('id').eq('email', lc(email)).maybeSingle()).data?.id || null);
      return people.get(lc(email));
    };
    let moved = 0;
    for (const r of rows || []) {
      const brokerage = r.brokerage_id || b;
      if (!brokerage) continue;
      const patch = {};
      if (table === 'transaction' && Array.isArray(r.documents)) {
        const folder = scopeFolder(brokerage, { kind: 'tx', id: r.id });
        const docs = [];
        for (const d of r.documents) docs.push(d?.url ? { ...d, url: await moveUrl(d.url, folder, cache) } : d);
        if (JSON.stringify(docs) !== JSON.stringify(r.documents)) patch.documents = docs;
      } else if (table === 'checklist' && Array.isArray(r.items)) {
        const uid = r.subject_type === 'transaction' ? null : await idOf(r.subject_email);
        if (r.subject_type !== 'transaction' && !uid) continue;
        const folder = scopeFolder(brokerage, r.subject_type === 'transaction' ? { kind: 'tx', id: r.subject_id } : { kind: 'user', id: uid });
        const items = [];
        for (const it of r.items) items.push(it?.document_url ? { ...it, document_url: await moveUrl(it.document_url, folder, cache) } : it);
        if (JSON.stringify(items) !== JSON.stringify(r.items)) patch.items = items;
      } else if (table === 'esign_document' || table === 'offer') {
        let scope;
        if (table === 'offer') scope = { kind: 'offer', id: r.id };
        else if (r.transaction_id) scope = { kind: 'tx', id: r.transaction_id };
        else { const uid = await idOf(r.created_by_email || r.created_by); if (!uid) continue; scope = { kind: 'user', id: uid }; }
        const folder = scopeFolder(brokerage, scope);
        for (const k of ['document_url', 'original_document_url']) {
          if (r[k]) { const next = await moveUrl(r[k], folder, cache); if (next !== r[k]) patch[k] = next; }
        }
      } else {
        let scope;
        if (table === 'direct_message') scope = { kind: 'dm', emails: [r.sender_email, r.receiver_email] };
        if (table === 'group_message') scope = { kind: 'group', id: r.group_id };
        if (table === 'social_message') scope = { kind: 'channel', name: r.channel };
        if (table === 'thread_reply') {
          const { data: parent } = await db.from('social_message').select('channel').eq('id', r.message_id).maybeSingle();
          if (!parent) continue;
          scope = { kind: 'channel', name: parent.channel };
        }
        let folder;
        try { folder = scopeFolder(brokerage, scope); } catch { continue; }
        const next = await moveInContent(r.content, folder, cache);
        if (next !== r.content) patch.content = next;
      }
      if (Object.keys(patch).length) {
        const { error: e2 } = await db.from(table).update(patch).eq('id', r.id);
        if (!e2) moved += 1;
      }
    }
    const last = rows?.[rows.length - 1];
    const doneTable = !rows || rows.length < 40;
    const nextTable = doneTable ? SECURE_TABLES[SECURE_TABLES.indexOf(table) + 1] || null : table;
    return Response.json({ table, moved, next: nextTable ? { table: nextTable, cursor: doneTable ? '' : last.id } : null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
