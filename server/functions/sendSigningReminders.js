// Daily job: reminds signers who haven't signed, every `remind_days` (default 2; 0 = off),
// and only when it's their turn. Rewritten during the migration; the old version
// emailed a link format the signing page never supported.
import { createClientFromRequest } from '../lib/base44.js';
import { whoseTurn, isExpired, emailSigner, audit } from '../lib/esign.js';

const DAY = 864e5;

export default async (req) => {
  try {
    const entities = createClientFromRequest(req).asServiceRole.entities;
    const open = [
      ...(await entities.ESignSubmission.filter({ status: 'pending' }, '-created_date', 500)),
      ...(await entities.ESignSubmission.filter({ status: 'in_progress' }, '-created_date', 500)),
    ];
    let sent = 0;
    for (const sub of open) {
      if (isExpired(sub)) continue;
      const every = sub.remind_days == null ? 2 : Number(sub.remind_days);
      if (!(every > 0)) continue;
      const due = whoseTurn(sub).filter((s) => {
        const since = new Date(s.last_reminded_at || s.notified_at || sub.submitted_at || sub.created_date).getTime();
        return Date.now() - since >= every * DAY - 3600e3; // an hour of slack so a daily job doesn't skip a day
      });
      if (!due.length) continue;
      const [doc] = await entities.ESignDocument.filter({ id: sub.document_id }, '-created_date', 1);
      if (!doc) continue;
      for (const s of due) {
        try {
          await emailSigner({ sub, doc, signer: s, reminder: true });
          s.last_reminded_at = new Date().toISOString();
          sent++;
          await audit(entities, { document_id: doc.id, action: 'reminder_sent', signer_email: s.email });
        } catch (err) {
          console.error('reminder failed', s.email, err.message);
        }
      }
      await entities.ESignSubmission.update(sub.id, { signers: sub.signers });
    }
    return Response.json({ status: 'success', remindersSent: sent, checked: open.length });
  } catch (error) {
    console.error('sendSigningReminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
};
