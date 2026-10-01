// New: permission to upload one private file. Checks the person can see the record the file
// is for, then returns a one-time upload link straight to storage (so big PDFs don't pass
// through the server) and the app link to save on the record.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { scopeFolder, parsePath, canAccess, safeName, fileUrl, PRIVATE_BUCKET } from '../lib/files.js';

const MAX = 50 * 1024 * 1024;

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { scope, name, size } = await req.json();
    if (size && Number(size) > MAX) return Response.json({ error: 'Files can be up to 50 MB.' }, { status: 400 });
    const folder = scopeFolder(me.brokerage_id, scope);
    const path = `${folder}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safeName(name)}`;
    if (!(await canAccess(me, parsePath(path), base44.entities))) return Response.json({ error: 'Not allowed to add files here' }, { status: 403 });
    const { data, error } = await adminClient().storage.from(PRIVATE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return Response.json({ error: error?.message || 'Could not start the upload' }, { status: 500 });
    return Response.json({ path, token: data.token, signedUrl: data.signedUrl, file_url: fileUrl(path) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
