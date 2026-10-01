// New: in-person signing. The agent hands their phone or tablet to the signer.
// { submissionId, signerEmail } -> { url } opening the signer's page in "in person" mode.
// The agent vouches for who is signing, so an emailed code isn't needed; the record and
// certificate say it was signed in person and who hosted it.
import { createClientFromRequest } from '../lib/base44.js';
import { tokenOf, whoseTurn, signerKey, makeProof, audit, clientIp } from '../lib/esign.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const { submissionId, signerEmail } = await req.json();
    const entities = base44.asServiceRole.entities;
    const [sub] = await entities.ESignSubmission.filter({ id: submissionId }, '-created_date', 1);
    if (!sub) return Response.json({ error: 'Signing request not found' }, { status: 404 });
    const [doc] = await entities.ESignDocument.filter({ id: sub.document_id }, '-created_date', 1);
    const brokerageId = sub.brokerage_id || doc?.brokerage_id;
    if (me.role !== 'super_admin' && brokerageId !== me.brokerage_id) return Response.json({ error: 'Not allowed' }, { status: 403 });
    if (['completed', 'voided'].includes(sub.status)) return Response.json({ error: `This request is ${sub.status}` }, { status: 409 });

    const signer = sub.signers.find((s) => s.email.toLowerCase() === String(signerEmail || '').toLowerCase());
    if (!signer) return Response.json({ error: 'Signer not found' }, { status: 404 });
    if (signer.signed) return Response.json({ error: 'That signer already signed' }, { status: 409 });
    if (!whoseTurn(sub).some((s) => signerKey(s) === signerKey(signer))) return Response.json({ error: "It isn't this signer's turn yet" }, { status: 409 });

    signer.in_person_by = me.email;
    signer.in_person_at = new Date().toISOString();
    let proof = null;
    if (sub.verify === 'email') {
      signer.verified_at = signer.in_person_at;
      proof = await makeProof(signer);
    }
    await entities.ESignSubmission.update(sub.id, { signers: sub.signers });
    await audit(entities, { document_id: sub.document_id, action: 'in_person_started', signer_email: signer.email, details: `In-person signing hosted by ${me.full_name || me.email} (${me.email})`, ip_address: clientIp(req), user_agent: req.headers.get('user-agent') });

    const token = await tokenOf(signer);
    return Response.json({ url: `/sign?token=${encodeURIComponent(token)}&inperson=1${proof ? `#proof=${proof}` : ''}` });
  } catch (error) {
    console.error('esignInPerson:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
