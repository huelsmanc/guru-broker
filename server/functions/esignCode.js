// New: one-time email codes for signers, when the sender turned on "Ask signers for a code".
//   { token, action: 'send' }          -> emails a 6-digit code (at most once a minute)
//   { token, action: 'check', code }   -> on success returns { proof } for this browser
import { createClientFromRequest } from '../lib/base44.js';
import { findByToken, matchSigner, isExpired, makeProof, audit, clientIp, esc, sha256Hex } from '../lib/esign.js';
import { SendEmail } from '../lib/integrations.js';

const hashCode = (code, signer) => sha256Hex(new TextEncoder().encode(`esign-code:${signer.token_hash || signer.email}:${code}`));

export default async (req) => {
  try {
    const { token, action, code } = await req.json().catch(() => ({}));
    const entities = createClientFromRequest(req).asServiceRole.entities;
    const sub = await findByToken(entities, token);
    if (!sub || ['voided'].includes(sub.status) || isExpired(sub)) return Response.json({ error: 'This signing link is not valid.' }, { status: 404 });
    const idx = await matchSigner(sub, token);
    const signer = sub.signers[idx];

    if (action === 'send') {
      if (signer.code_sent_at && Date.now() - new Date(signer.code_sent_at).getTime() < 60_000) return Response.json({ status: 'sent' });
      const fresh = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
      signer.code_hash = await hashCode(fresh, signer);
      signer.code_sent_at = new Date().toISOString();
      signer.code_attempts = 0;
      await entities.ESignSubmission.update(sub.id, { signers: sub.signers });
      await SendEmail({
        to: signer.email,
        subject: `Your signing code: ${fresh}`,
        from_name: `${sub.created_by_name || 'Your agent'} via Guru Broker`,
        body: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937"><p>Hi ${esc(signer.name || '')},</p><p>Your code to open the document is:</p><p style="font-size:30px;letter-spacing:6px;font-weight:bold">${fresh}</p><p style="color:#6b7280;font-size:13px">It works for 15 minutes. If you didn't ask for it, you can ignore this email.</p></div>`,
      });
      await audit(entities, { document_id: sub.document_id, action: 'code_sent', signer_email: signer.email, ip_address: clientIp(req) });
      return Response.json({ status: 'sent' });
    }

    if (action === 'check') {
      if (!signer.code_hash || Date.now() - new Date(signer.code_sent_at).getTime() > 15 * 60_000) return Response.json({ error: 'That code has expired. Send a new one.' }, { status: 400 });
      if ((signer.code_attempts || 0) >= 5) return Response.json({ error: 'Too many tries. Send a new code.' }, { status: 429 });
      const ok = (await hashCode(String(code || '').replace(/\D/g, ''), signer)) === signer.code_hash;
      signer.code_attempts = (signer.code_attempts || 0) + 1;
      if (!ok) {
        await entities.ESignSubmission.update(sub.id, { signers: sub.signers });
        return Response.json({ error: "That code isn't right. Check the latest email." }, { status: 400 });
      }
      signer.verified_at = new Date().toISOString();
      signer.code_hash = null;
      await entities.ESignSubmission.update(sub.id, { signers: sub.signers });
      await audit(entities, { document_id: sub.document_id, action: 'identity_confirmed', signer_email: signer.email, details: 'Entered the code emailed to them', ip_address: clientIp(req), user_agent: req.headers.get('user-agent') });
      return Response.json({ proof: await makeProof(signer) });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('esignCode:', error);
    return Response.json({ error: 'Could not do that. Please try again.' }, { status: 500 });
  }
};
