// New: "Offer accepted". Creates the transaction from the offer, assigns the brokerage's
// default transaction coordinator (TC), starts the checklist, and notifies the TC.
import { createClientFromRequest, appUrl } from '../lib/base44.js';
import { SendEmail } from '../lib/integrations.js';
import { esc } from '../lib/esign.js';

const addDays = (iso, days) => {
  if (!iso || !days) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
};

const CHECKLIST = [
  'Send executed offer to all parties',
  'Confirm earnest money received',
  'Order / schedule home inspection',
  'Send contract to lender and title / attorney',
  'Track inspection contingency deadline',
  'Order appraisal',
  'Track financing contingency / loan commitment',
  'Review title commitment',
  'Schedule final walk-through',
  'Confirm closing date, time and location',
  'Collect all signed disclosures and addenda',
  'Upload final settlement statement',
];

export default async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { offerId, acceptanceDate, tcEmail, finalPrice } = await req.json();
    const entities = base44.asServiceRole.entities;
    const [offer] = await entities.Offer.filter({ id: offerId }, '-created_date', 1);
    if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
    const isAdmin = ['admin', 'broker', 'super_admin'].includes(me.role);
    if (offer.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    if (!isAdmin && offer.agent_email !== me.email) return Response.json({ error: 'Only the offer\'s agent or an admin can do this' }, { status: 403 });
    if (offer.transaction_id) return Response.json({ status: 'exists', transaction_id: offer.transaction_id });

    const accepted = acceptanceDate || new Date().toISOString().slice(0, 10);
    const [settings] = await entities.BrokerageSettings.filter({ brokerage_id: offer.brokerage_id }, '-created_date', 1);
    let tc = null;
    const pickEmail = tcEmail || settings?.default_tc_email;
    if (pickEmail) {
      const [u] = await entities.User.filter({ email: pickEmail }, '-created_date', 1);
      tc = { email: pickEmail, name: u?.display_name || u?.full_name || settings?.default_tc_name || pickEmail };
    }

    const price = finalPrice ?? offer.offer_price;
    const documents = [];
    if (offer.document_url) documents.push({ name: 'Offer', url: offer.document_url, uploaded_at: new Date().toISOString(), uploaded_by: me.full_name || me.email });

    const tx = await entities.Transaction.create({
      brokerage_id: offer.brokerage_id,
      property_address: [offer.property_address, offer.city, offer.state, offer.zip].filter(Boolean).join(', '),
      agent_email: offer.agent_email,
      agent_name: offer.agent_name,
      tc_email: tc?.email || null,
      tc_name: tc?.name || null,
      buyers: (offer.buyers || []).map((b) => (typeof b === 'string' ? b : b?.name)).filter(Boolean),
      sellers: (offer.sellers || []).map((b) => (typeof b === 'string' ? b : b?.name)).filter(Boolean),
      sale_price: price,
      closing_date: offer.closing_date || null,
      inspection_contingency_date: addDays(accepted, offer.inspection_days),
      financing_contingency_date: offer.financing_type === 'cash' ? null : addDays(accepted, offer.financing_days),
      status: 'active',
      checklist: CHECKLIST.map((title, i) => ({ id: `${Date.now()}-${i}`, title, completed: false, completed_by: null, completed_at: null })),
      documents,
      updates: [{ id: Date.now().toString(), message: `Offer accepted ${accepted}. Transaction opened from the offer.`, milestone: 'Under Contract', posted_by: me.full_name || me.email, posted_at: new Date().toISOString() }],
      // extra
      transaction_type: 'purchase',
      acceptance_date: accepted,
      earnest_money: offer.earnest_money,
      financing_type: offer.financing_type,
      mls_number: offer.mls_number,
      offer_id: offer.id,
    });

    await entities.Offer.update(offer.id, { status: 'accepted', accepted_at: new Date().toISOString(), acceptance_date: accepted, transaction_id: tx.id });

    if (tc) {
      const link = `${appUrl()}/Transactions?open=${tx.id}`;
      await entities.Notification.create({
        brokerage_id: offer.brokerage_id,
        user_email: tc.email,
        title: 'New transaction assigned',
        description: `${tx.property_address}: offer accepted. You're the TC.`,
        type: 'transaction',
        action_url: `/Transactions?open=${tx.id}`,
        reference_id: tx.id,
        reference_type: 'Transaction',
        read: false,
      }).catch((e) => console.error('notify TC failed', e.message));
      await SendEmail({
        to: tc.email,
        subject: `New transaction: ${tx.property_address}`,
        from_name: 'Guru Broker',
        body: `<div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.55">
<p>Hi ${esc(tc.name)},</p>
<p><strong>${esc(offer.agent_name || offer.agent_email)}</strong>'s offer on <strong>${esc(tx.property_address)}</strong> was accepted on ${esc(accepted)}, and you're the transaction coordinator.</p>
<ul>
<li>Price: $${Number(price || 0).toLocaleString('en-US')}</li>
<li>Buyer(s): ${esc((tx.buyers || []).join(', ') || '-')}</li>
<li>Closing: ${esc(tx.closing_date || 'TBD')}</li>
<li>Inspection deadline: ${esc(tx.inspection_contingency_date || '-')}</li>
<li>Financing deadline: ${esc(tx.financing_contingency_date || '-')}</li>
</ul>
<p><a href="${esc(link)}" style="display:inline-block;padding:11px 22px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Open transaction</a></p>
<p style="font-size:12px;color:#6b7280">The checklist is started and deadline reminders are on.</p></div>`,
      }).catch((e) => console.error('TC email failed', e.message));
    }

    return Response.json({ status: 'success', transaction_id: tx.id, tc });
  } catch (error) {
    console.error('offerAccepted:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
