// New: lets a signer attach a file (e.g. proof of funds) to an "Attach a file" field.
// Authorized by the signing link; the file goes to the deal's private folder (or the sender's).
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { findByToken, matchSigner, isExpired, whoseTurn, signerKey, codeOk } from '../lib/esign.js';
import { scopeFolder, safeName, fileUrl, PRIVATE_BUCKET } from '../lib/files.js';

const MAX = 20 * 1024 * 1024;

export default async (req) => {
  try {
    const { token, proof, name, size } = await req.json().catch(() => ({}));
    const entities = createClientFromRequest(req).asServiceRole.entities;
    const sub = await findByToken(entities, token);
    if (!sub || sub.status === 'voided' || sub.status === 'completed' || isExpired(sub)) return Response.json({ error: 'This signing link is not valid.' }, { status: 404 });
    const signer = sub.signers[await matchSigner(sub, token)];
    if (signer.signed || !whoseTurn(sub).some((s) => signerKey(s) === signerKey(signer))) return Response.json({ error: "You can't add files right now." }, { status: 409 });
    if (!(await codeOk(sub, signer, proof))) return Response.json({ error: 'Please enter the code we emailed you first.' }, { status: 401 });
    if (!sub.attach_scope) return Response.json({ error: 'This request does not accept files.' }, { status: 400 });
    if (size && Number(size) > MAX) return Response.json({ error: 'Files can be up to 20 MB.' }, { status: 400 });
    const folder = scopeFolder(sub.brokerage_id, sub.attach_scope);
    const path = `${folder}/esign-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safeName(name)}`;
    const { data, error } = await adminClient().storage.from(PRIVATE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return Response.json({ error: 'Could not start the upload' }, { status: 500 });
    return Response.json({ path, token: data.token, file_url: fileUrl(path) });
  } catch (error) {
    console.error('esignAttach:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
