// New: "Send CEO thank-you" on a closed deal. Emails the deal's client contacts a
// thank-you from the CEO with a video (thumbnail that opens YouTube; email apps can't
// play embedded video). { preview: true } returns the email without sending.
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';
import { SendEmail } from '../lib/integrations.js';
import { esc } from '../lib/esign.js';

export function youtubeId(url = '') {
  const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export function thankYouHtml({ settings, clientName, tx, agentName }) {
  const vid = youtubeId(settings?.thank_you_video_url);
  const ceo = settings?.ceo_name || settings?.broker_name || 'Our team';
  const firstName = String(clientName || '').split(/\s+/)[0] || 'there';
  const msg = String(settings?.thank_you_message || `Congratulations on your new home at {address}! It was an honor to be part of this milestone. If you ever need anything, from a referral to a question about your home, we're here.`)
    .replaceAll('{first_name}', firstName).replaceAll('{address}', tx.property_address || 'your new home').replaceAll('{agent}', agentName || 'your agent');
  return `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f4;font-family:Georgia,'Times New Roman',serif;color:#1c1917">
<div style="max-width:580px;margin:0 auto;padding:28px 16px">
  <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4">
    ${settings?.logo_url ? `<div style="padding:22px 28px 0"><img src="${esc(settings.logo_url)}" alt="" style="max-height:44px"></div>` : ''}
    <div style="padding:22px 28px 8px;font-size:17px;line-height:1.65">
      <p style="margin:0 0 14px">Dear ${esc(firstName)},</p>
      ${msg.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
    </div>
    ${vid ? `<div style="padding:4px 28px 18px">
      <a href="https://www.youtube.com/watch?v=${vid}" style="display:block;position:relative;text-decoration:none">
        <img src="https://img.youtube.com/vi/${vid}/hqdefault.jpg" alt="Watch a message from ${esc(ceo)}" width="524" style="width:100%;border-radius:8px;display:block">
      </a>
      <p style="margin:8px 0 0;text-align:center;font-family:Arial,sans-serif;font-size:14px"><a href="https://www.youtube.com/watch?v=${vid}" style="color:#b91c1c;font-weight:bold;text-decoration:none">&#9654; Watch a personal message from ${esc(ceo)}</a></p>
    </div>` : ''}
    <div style="padding:6px 28px 26px;font-size:16px;line-height:1.5">
      <p style="margin:0">With gratitude,</p>
      ${settings?.ceo_signature_url ? `<img src="${esc(settings.ceo_signature_url)}" alt="" style="max-height:48px;margin:8px 0">` : ''}
      <p style="margin:6px 0 0;font-weight:bold">${esc(ceo)}</p>
      <p style="margin:0;color:#57534e;font-family:Arial,sans-serif;font-size:13px">${esc(settings?.ceo_title || 'CEO')}${settings?.brokerage_name ? `, ${esc(settings.brokerage_name)}` : ''}</p>
    </div>
  </div>
</div></body></html>`;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!isAdminRole(me.role)) return Response.json({ error: 'Admins only' }, { status: 403 });
    const { transactionId, preview, contactIds } = await req.json();
    const entities = base44.asServiceRole.entities;
    const tx = await entities.Transaction.get(transactionId);
    if (tx.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    const [settings] = await entities.BrokerageSettings.filter({ brokerage_id: tx.brokerage_id }, '-created_date', 1);
    let clients = (await entities.TransactionContact.filter({ transaction_id: tx.id }, 'created_date', 100)).filter((c) => c.is_client && c.email);
    if (contactIds?.length) clients = clients.filter((c) => contactIds.includes(c.id));
    const sample = clients[0] || { name: (tx.buyers || [])[0] || 'Client', email: '' };
    const html = thankYouHtml({ settings, clientName: sample.name, tx, agentName: tx.agent_name });
    const subject = settings?.thank_you_subject || `Congratulations on ${tx.property_address ? tx.property_address.split(',')[0] : 'your new home'}!`;
    if (preview) return Response.json({ subject, html, recipients: clients.map((c) => ({ id: c.id, name: c.name, email: c.email })) });
    if (!clients.length) return Response.json({ error: 'Add the clients as contacts on this deal (tick "Client") first' }, { status: 400 });
    for (const c of clients) {
      await SendEmail({
        to: c.email,
        subject,
        from_name: settings?.ceo_name ? `${settings.ceo_name}, ${settings?.brokerage_name || 'Guru Broker'}` : (settings?.brokerage_name || 'Guru Broker'),
        reply_to: settings?.ceo_email || tx.agent_email || undefined,
        body: thankYouHtml({ settings, clientName: c.name, tx, agentName: tx.agent_name }),
      });
    }
    await entities.Transaction.update(tx.id, { thank_you_sent_at: new Date().toISOString() });
    return Response.json({ status: 'success', sent: clients.length });
  } catch (error) {
    console.error('ceoThankYou:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
