// Company library: the changes that touch stored files (library managers only).
//   delete_file { id }              -> the entry, its stored file and its form setup
//   delete_folder { id }            -> the folder and everything in it
//   duplicate { id }                -> a copy of the file (and its form setup) in the same folder
// Reading, uploading, renaming and moving go through the app's security rules directly.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';
import { pathFromUrl, parsePath, readFileBytes, storePrivate, scopeFolder, PRIVATE_BUCKET } from '../lib/files.js';

class Problem extends Error { constructor(m, s = 400) { super(m); this.status = s; } }

// Checklist templates and other form setups may point at the same file (picked from the library);
// the stored file is only removed when nothing else uses it.
async function removeStored(db, file) {
  const url = file.file_url;
  const path = pathFromUrl(url);
  if (!path) return;
  const { data: others } = await db.from('file_repository').select('id').eq('file_url', url).limit(5);
  if ((others || []).some((r) => r.id !== file.id)) return;
  const { data: forms } = await db.from('esign_template').select('id').eq('document_url', url).limit(1);
  if ((forms || []).length) return;
  const { data: lists } = await db.from('checklist_template').select('items').eq('brokerage_id', file.brokerage_id).limit(500);
  if ((lists || []).some((l) => JSON.stringify(l.items || []).includes(url))) return;
  await db.storage.from(PRIVATE_BUCKET).remove([path]).catch(() => {});
}

async function dropFile(E, db, file) {
  // Its own form setup (made from the library), not setups other screens made on the same file.
  const templates = await E.ESignTemplate.filter({ brokerage_id: file.brokerage_id, document_url: file.file_url }, '-created_date', 20).catch(() => []);
  for (const t of templates.filter((x) => x.id === file.esign_template_id || x.source_file_id === file.id)) await E.ESignTemplate.delete(t.id).catch(() => {});
  await E.FileRepository.delete(file.id);
  await removeStored(db, file);
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) throw new Problem('Not signed in', 401);
    if (!isAdminRole(me.role) && !can(me, 'library.manage')) throw new Problem('Only library managers can do that', 403);
    const body = await req.json().catch(() => ({}));
    const E = base44.entities; // the person's own access: they can only touch what they can see
    const db = adminClient();
    const one = async (entity, id) => {
      const row = id && (await E[entity].filter({ id: String(id) }, '-created_date', 1).catch(() => []))[0];
      if (!row) throw new Problem('Not found', 404);
      return row;
    };

    if (body.action === 'delete_file') {
      await dropFile(E, db, await one('FileRepository', body.id));
      return Response.json({ ok: true });
    }

    if (body.action === 'delete_folder') {
      const folder = await one('LibraryFolder', body.id);
      const files = await E.FileRepository.filter({ folder_id: folder.id }, '-created_date', 1000);
      for (const f of files) await dropFile(E, db, f);
      await E.LibraryFolder.delete(folder.id);
      return Response.json({ ok: true, removed: files.length });
    }

    if (body.action === 'duplicate') {
      const file = await one('FileRepository', body.id);
      const info = parsePath(pathFromUrl(file.file_url));
      const folder = info ? scopeFolder(file.brokerage_id, file.folder_id ? { kind: 'library', id: file.folder_id } : { kind: 'misc' }) : null;
      const name = `Copy of ${file.file_name}`.slice(0, 200);
      const url = folder ? await storePrivate(folder, file.file_name, await readFileBytes(file.file_url), /\.pdf$/i.test(file.file_name) ? 'application/pdf' : undefined) : file.file_url;
      const { id, created_date, updated_date, created_by, extra, esign_template_id, ...rest } = file; // eslint-disable-line no-unused-vars
      const copy = await E.FileRepository.create({ ...rest, file_name: name, file_url: url, downloads_count: 0, is_featured: false, uploaded_by_email: me.email, uploaded_by_name: me.display_name || me.full_name || me.email });
      const t = (await E.ESignTemplate.filter({ brokerage_id: file.brokerage_id, document_url: file.file_url }, '-created_date', 20).catch(() => []))
        .find((x) => x.id === file.esign_template_id || x.source_file_id === file.id || (x.fields || []).length);
      if (t) {
        const made = await E.ESignTemplate.create({ brokerage_id: file.brokerage_id, title: name.replace(/\.[^.]+$/, ''), document_url: url, fields: t.fields || [], roles: t.roles || [],
          role_order: !!t.role_order, initiator: t.initiator !== false, source_file_id: copy.id, created_by_email: me.email });
        await E.FileRepository.update(copy.id, { esign_template_id: made.id }).catch(() => {});
      }
      return Response.json({ file: copy });
    }

    throw new Problem('Unknown action');
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('library:', e);
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
};
