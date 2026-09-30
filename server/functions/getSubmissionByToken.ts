// Loads what a signer needs for /sign?token=... Only this signer's details are returned;
// other signers' links and personal data are never sent to the browser.
import { createClientFromRequest } from '../lib/base44.js';
import { findByToken, isExpired, whoseTurn, signerIndexInDoc, audit, clientIp, matchSigner, signerKey } from '../lib/esign.js';

export default async (req: Request) => {
  try {
    const { token } = await req.json().catch(() => ({}));
    const entities = createClientFromRequest(req).asServiceRole.entities;
    const sub = await findByToken(entities, token);
    if (!sub) return Response.json({ error: 'This signing link is not valid. Ask the sender for a new one.' }, { status: 404 });
    if (sub.status === 'voided') return Response.json({ error: 'The sender cancelled this signing request.' }, { status: 410 });
    if (isExpired(sub) && sub.status !== 'completed') {
      return Response.json({ error: 'This signing link has expired. Ask the sender to resend it.' }, { status: 410 });
    }

    const signer = sub.signers[await matchSigner(sub, token)];
    const [doc] = await entities.ESignDocument.filter({ id: sub.document_id }, '-created_date', 1);
    if (!doc) return Response.json({ error: 'Document not found.' }, { status: 404 });

    const waiting = !signer.signed && !whoseTurn(sub).some((s) => signerKey(s) === signerKey(signer));
    if (waiting) {
      // Signing in order and it isn't this person's turn: show nothing but the title.
      return Response.json({ waiting: true, signer: { name: signer.name, email: signer.email }, document: { title: doc.title }, senderName: sub.created_by_name });
    }

    if (!signer.viewed_at && !signer.signed) {
      signer.viewed_at = new Date().toISOString();
      await entities.ESignSubmission.update(sub.id, { signers: sub.signers });
      await audit(entities, { document_id: doc.id, action: 'viewed', signer_email: signer.email, ip_address: clientIp(req), user_agent: req.headers.get('user-agent') });
    }

    const signerIndex = signerIndexInDoc(doc, sub, signer);
    return Response.json({
      signer: { name: signer.name, email: signer.email, signed: signer.signed },
      signerIndex,
      alreadySigned: !!signer.signed,
      waiting: false,
      senderName: sub.created_by_name,
      message: sub.message || null,
      document: {
        id: doc.id,
        title: doc.title,
        document_url: doc.document_url,
        fields: doc.fields || [],
      },
    });
  } catch (error) {
    console.error('getSubmissionByToken:', error);
    return Response.json({ error: 'Could not load this document. Please try again.' }, { status: 500 });
  }
};
