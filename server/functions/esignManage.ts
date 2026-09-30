// New: sender actions on a signing request.
//   action: 'resend'  -> re-email a signer (optionally a new email address), resets the 30-day clock
//   action: 'void'    -> cancel the request; links stop working
//   action: 'rebuild' -> regenerate the signed PDF for a completed request
import { createClientFromRequest } from '../lib/base44.js';
import { emailSigner, finalize, audit, LINK_DAYS, whoseTurn } from '../lib/esign.js';

export default async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const { action, submissionId, signerEmail, newEmail } = await req.json();
    const entities = base44.asServiceRole.entities;
    const [sub] = await entities.ESignSubmission.filter({ id: submissionId }, '-created_date', 1);
    if (!sub) return Response.json({ error: 'Signing request not found' }, { status: 404 });
    const [doc] = await entities.ESignDocument.filter({ id: sub.document_id }, '-created_date', 1);
    const brokerageId = sub.brokerage_id || doc?.brokerage_id;
    if (me.role !== 'super_admin' && brokerageId !== me.brokerage_id) return Response.json({ error: 'Not allowed' }, { status: 403 });

    if (action === 'void') {
      if (sub.status === 'completed') return Response.json({ error: 'Completed documents cannot be cancelled' }, { status: 409 });
      await entities.ESignSubmission.update(sub.id, { status: 'voided', voided_at: new Date().toISOString(), voided_by: me.email });
      if (doc) await entities.ESignDocument.update(doc.id, { status: 'voided' });
      await audit(entities, { document_id: sub.document_id, action: 'voided', details: `Cancelled by ${me.email}` });
      return Response.json({ status: 'success' });
    }

    if (action === 'resend') {
      if (['completed', 'voided'].includes(sub.status)) return Response.json({ error: `This request is ${sub.status}` }, { status: 409 });
      const signer = sub.signers.find((s) => s.email.toLowerCase() === String(signerEmail || '').toLowerCase());
      if (!signer) return Response.json({ error: 'Signer not found' }, { status: 404 });
      if (signer.signed) return Response.json({ error: 'That signer already signed' }, { status: 409 });
      if (!whoseTurn(sub).includes(signer)) return Response.json({ error: "It isn't this signer's turn yet" }, { status: 409 });
      if (newEmail && /\S+@\S+\.\S+/.test(newEmail)) signer.email = newEmail.trim().toLowerCase();
      signer.notified_at = new Date().toISOString();
      await entities.ESignSubmission.update(sub.id, {
        signers: sub.signers,
        expires_at: new Date(Date.now() + LINK_DAYS * 864e5).toISOString(),
      });
      await emailSigner({ sub, doc, signer });
      await audit(entities, { document_id: sub.document_id, action: 'resent', signer_email: signer.email, details: `Resent by ${me.email}` });
      return Response.json({ status: 'success' });
    }

    if (action === 'rebuild') {
      if (sub.status !== 'completed') return Response.json({ error: 'Not everyone has signed yet' }, { status: 409 });
      const updated = await finalize({ entities, sub, doc });
      return Response.json({ status: 'success', signed_document_url: updated.signed_document_url });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('esignManage:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
