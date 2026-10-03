// Private files. Deal documents, offers, onboarding paperwork and chat attachments live in
// the private bucket, in a folder for the record they belong to:
//
//   scoped/<brokerage>/tx/<transaction id>/...     whoever can see the deal
//   scoped/<brokerage>/offer/<offer id>/...        whoever can see the offer
//   scoped/<brokerage>/user/<user id>/...          that person and admins (onboarding, own e-sign drafts)
//   scoped/<brokerage>/dm/<a>.<b>/...              the two people in the DM
//   scoped/<brokerage>/group/<group id>/...        the group chat's members
//   scoped/<brokerage>/channel/<name>/...          whoever can see the channel
//   scoped/<brokerage>/library/<folder id>/...     the company library: whoever can see the file's
//                                                  folder now (private folders: admins and chosen people)
//   scoped/<brokerage>/misc/...                    anyone in the brokerage (older library files follow
//                                                  their library folder too)
//
// The app links to them as /api/file?p=<path>. Every time one is opened, the server checks
// the person is signed in and allowed to see that record (using the same security rules as
// the rest of the app), then redirects to a link that works for one minute. A forwarded or
// leaked link is useless to anyone outside.

import { adminClient } from './base44.js';
import { isAdminRole, can } from '../../shared/permissions.generated.js';

export const PRIVATE_BUCKET = 'private-files';
const lc = (e) => String(e || '').toLowerCase();
const enc = (s) => Buffer.from(String(s)).toString('base64url');
const dec = (s) => Buffer.from(String(s), 'base64url').toString();
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function safeName(name) {
  const clean = String(name || 'file').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '');
  return clean.slice(-90) || 'file';
}

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

/** Folder for a scope: { kind: 'tx'|'offer'|'user'|'group', id } | { kind: 'dm', emails: [a, b] } | { kind: 'channel', name } | { kind: 'misc' }. */
export function scopeFolder(brokerageId, scope = {}) {
  if (!brokerageId || !ID.test(String(brokerageId))) throw bad('No brokerage');
  const base = `scoped/${brokerageId}`;
  switch (scope.kind) {
    case 'tx': case 'offer': case 'user': case 'group': case 'library':
      if (!ID.test(String(scope.id || ''))) throw bad('Bad file scope');
      return `${base}/${scope.kind}/${scope.id}`;
    case 'dm': {
      const pair = [...new Set((scope.emails || []).map(lc))].sort();
      if (pair.length !== 2 || pair.some((e) => !e.includes('@'))) throw bad('Bad file scope');
      return `${base}/dm/${pair.map(enc).join('.')}`;
    }
    case 'channel':
      if (!scope.name) throw bad('Bad file scope');
      return `${base}/channel/${enc(scope.name)}`;
    case 'misc':
      return `${base}/misc`;
    case 'forms': // blank contract forms (brokerage's own, or 'platform' for everyone)
      return `${base}/forms`;
    default:
      throw bad('Bad file scope');
  }
}

/** What a stored path belongs to, or null if it isn't one of ours. */
export function parsePath(path) {
  const p = String(path || '');
  if (!p.startsWith('scoped/') || p.includes('..') || p.includes('//') || p.length > 600) return null;
  const parts = p.split('/');
  const [, brokerageId, kind] = parts;
  if (!ID.test(brokerageId || '')) return null;
  const name = parts[parts.length - 1];
  if (kind === 'misc' || kind === 'forms') return parts.length >= 4 ? { brokerageId, kind, name, path: p } : null;
  if (parts.length < 5) return null;
  const key = parts[3];
  if (['tx', 'offer', 'user', 'group', 'library'].includes(kind)) return ID.test(key) ? { brokerageId, kind, id: key, name, path: p } : null;
  if (kind === 'dm') {
    const emails = key.split('.').map(dec).map(lc);
    return emails.length === 2 && emails.every((e) => e.includes('@')) ? { brokerageId, kind, emails, name } : null;
  }
  if (kind === 'channel') return { brokerageId, kind, channel: dec(key), name };
  return null;
}

export const fileUrl = (path, { download } = {}) => `/api/file?${download ? 'download=1&' : ''}p=${encodeURIComponent(path)}`;

/** The stored path inside one of our private links (relative or absolute), else null. */
export function pathFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/\/api\/file\?(?:[^#]*&)?p=([^&#]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}
export const isPrivateUrl = (url) => !!pathFromUrl(url);

/**
 * Can this person open files in this folder? `entities` must be the person's own
 * (base44.entities from their request), so the app's security rules decide for records.
 */
export async function canAccess(me, info, entities) {
  if (!me || !info || me.suspended) return false;
  if (me.role === 'super_admin') return true;
  // Platform state forms: only brokerages assigned to that form's state (the security rules
  // on contract_form decide, through the person's own access).
  if (info.kind === 'forms' && info.brokerageId === 'platform') {
    if (!me.brokerage_id) return false;
    const url = fileUrl(`scoped/platform/forms/${info.name}`);
    return ((await entities.ContractForm.filter({ document_url: url }, '-created_date', 1).catch(() => [])) || []).length > 0;
  }
  if (info.brokerageId !== me.brokerage_id) return false;
  const one = async (entity, query) => ((await entities[entity].filter(query, '-created_date', 1).catch(() => [])) || []).length > 0;
  switch (info.kind) {
    case 'misc': case 'library': return libraryFileOk(me, info, entities);
    case 'forms': return true;
    case 'user': return info.id === me.id || isAdminRole(me.role) || can(me, 'users.manage');
    case 'dm': return info.emails.includes(lc(me.email));
    case 'tx': return one('Transaction', { id: info.id });
    case 'offer': return one('Offer', { id: info.id });
    case 'group': return one('GroupChat', { id: info.id });
    case 'channel': return one('Channel', { brokerage_id: info.brokerageId, name: info.channel });
    default: return false;
  }
}

/**
 * Library files go wherever their library entry is: if the file is in the library, the person must be
 * able to see that entry (its folder decides). Other "misc" files stay open to the brokerage. A new
 * library upload (no entry yet) is for library managers only.
 */
async function libraryFileOk(me, info, entities) {
  const url = fileUrl(info.path || '');
  const { data } = await adminClient().from('file_repository').select('id').eq('file_url', url).limit(1);
  const row = (data || [])[0];
  if (!row) return info.kind === 'misc' || isAdminRole(me.role) || can(me, 'library.manage');
  return ((await entities.FileRepository.filter({ id: row.id }, '-created_date', 1).catch(() => [])) || []).length > 0;
}

/** A link to a private file that works for `seconds` (for e-mail signers, AI, downloads). */
export async function signedUrlFor(url, seconds = 600, { download } = {}) {
  const path = pathFromUrl(url);
  if (!path) return url;
  const info = parsePath(path);
  const { data, error } = await adminClient().storage.from(PRIVATE_BUCKET).createSignedUrl(path, seconds, download ? { download: info?.name || true } : undefined);
  if (error || !data?.signedUrl) throw Object.assign(new Error('File not found'), { status: 404 });
  return data.signedUrl;
}

/** Bytes of any file the app stores (private or public). */
export async function readFileBytes(url) {
  const path = pathFromUrl(url);
  if (path) {
    const { data, error } = await adminClient().storage.from(PRIVATE_BUCKET).download(path);
    if (error || !data) throw Object.assign(new Error('File not found'), { status: 404 });
    return new Uint8Array(await data.arrayBuffer());
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the file (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Turns links a person sent us (e.g. "scan these files") into links an outside service can
 * fetch, but only for private files that person is allowed to open. Others are refused.
 */
export async function resolveForUser(me, entities, urls = []) {
  const out = [];
  for (const u of urls) {
    const path = pathFromUrl(u);
    if (!path) {
      if (!/^https:\/\//.test(String(u))) throw Object.assign(new Error('Unsupported file link'), { status: 400 });
      out.push(u);
      continue;
    }
    if (!(await canAccess(me, parsePath(path), entities))) throw Object.assign(new Error('Not allowed to use that file'), { status: 403 });
    out.push(await signedUrlFor(u, 900));
  }
  return out;
}

/** Copy bytes into a private folder and return the app link. */
export async function storePrivate(folder, name, bytes, contentType) {
  const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safeName(name)}`;
  const { error } = await adminClient().storage.from(PRIVATE_BUCKET).upload(path, bytes, { contentType: contentType || 'application/octet-stream', upsert: false });
  if (error) throw new Error(error.message);
  return fileUrl(path);
}
