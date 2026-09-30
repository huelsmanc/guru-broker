// New: email the offer to the listing agent. Attaches the signed PDF when the buyers have
// signed, otherwise the offer PDF. Sent in the agent's name; replies go to the agent,
// who is copied.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { SendEmail } from '../lib/integrations.js';
import { esc } from '../lib/esign.js';
import { isAdminRole, can } from '../lib/team.js';

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not read the offer PDF (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { offerId, to, cc, message, subject } = await req.json();
    const entities = base44.asServiceRole.entities;
    const [offer] = await entities.Offer.filter({ id: offerId }, '-created_date', 1);
    if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
    if (offer.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    if (offer.agent_email !== me.email && !isAdminRole(me.role)) return Response.json({ error: 'Only the offer\'s agent can send it' }, { status: 403 });
    const recipient = String(to || offer.listing_agent_email || '').trim();
    if (!/\S+@\S+\.\S+/.test(recipient)) return Response.json({ error: 'Add the listing agent\'s email first' }, { status: 400 });

    // Prefer the signed copy.
    let pdf = null; let signed = false;
    if (offer.submission_id) {
      const [sub] = await entities.ESignSubmission.filter({ id: offer.submission_id }, '-created_date', 1);
      if (sub?.status === 'completed' && sub.signed_pdf_path) {
        const path = String(sub.signed_pdf_path).replace(/^private-files\//, '');
        const { data } = await adminClient().storage.from('private-files').download(path);
        if (data) { pdf = Buffer.from(await data.arrayBuffer()); signed = true; }
      }
    }
    if (!pdf && offer.document_url) pdf = await download(offer.document_url);
    if (!pdf) return Response.json({ error: 'Create the offer PDF first (Send to buyers to sign, or Save & send)' }, { status: 400 });

    const agentName = offer.agent_name || me.full_name || me.email;
    const address = [offer.property_address, offer.city, offer.state].filter(Boolean).join(', ');
    const note = message ? String(message).slice(0, 5000) : '';
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;line-height:1.55;color:#1f2937">
<p>Hi ${esc(offer.listing_agent_name || 'there')},</p>
${note ? `<div style="white-space:pre-wrap">${esc(note)}</div>` : `<p>Please find attached our ${signed ? 'signed ' : ''}offer on <strong>${esc(address)}</strong> on behalf of ${esc((offer.buyers || []).map((b) => b?.name || b).filter(Boolean).join(' and ') || 'my buyers')}.</p>`}
<ul>
<li>Offer price: $${Number(offer.offer_price || 0).toLocaleString('en-US')}</li>
${offer.earnest_money ? `<li>Earnest money: $${Number(offer.earnest_money).toLocaleString('en-US')}</li>` : ''}
<li>Financing: ${esc(offer.financing_type || '-')}</li>
${offer.closing_date ? `<li>Closing: ${esc(offer.closing_date)}</li>` : ''}
${offer.offer_expiration ? `<li>Offer expires: ${esc(new Date(offer.offer_expiration).toLocaleString('en-US', { timeZone: 'America/New_York' }))}</li>` : ''}
</ul>
<p>Please confirm receipt. Reply to this email to reach me directly.</p>
<p>${esc(agentName)}<br/>${esc(me.email)}</p>
</div>`;
    const filename = `Offer - ${address.replace(/[^A-Za-z0-9 ,.-]/g, '')}${signed ? ' (signed)' : ''}.pdf`;
    const ccList = [me.email, ...(Array.isArray(cc) ? cc : cc ? [cc] : [])].filter((e) => /\S+@\S+\.\S+/.test(e));
    await SendEmail({
      to: recipient,
      cc: ccList,
      reply_to: me.email,
      from_name: `${agentName} via Guru Broker`,
      subject: subject || `Offer: ${address}`,
      body: html,
      attachments: [{ filename, content: pdf.toString('base64') }],
    });
    const history = Array.isArray(offer.send_history) ? offer.send_history : [];
    await entities.Offer.update(offer.id, {
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      submitted_to: recipient,
      send_history: [...history, { to: recipient, cc: ccList, signed, at: new Date().toISOString(), by: me.email }],
    });
    return Response.json({ status: 'success', signed, to: recipient });
  } catch (error) {
    console.error('offerSend:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
