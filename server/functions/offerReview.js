// New: broker review of an offer before it goes out.
//   action 'request' (agent): asks admins/brokers to review, with an optional note
//   action 'approve' | 'changes' (admin/broker): answers, with an optional note
import { createClientFromRequest } from '../lib/base44.js';
import { admins, withDuty, notifyPeople, ADMIN_ROLES } from '../lib/team.js';
import { esc } from '../lib/esign.js';

const money = (n) => (n == null ? '-' : `$${Number(n).toLocaleString('en-US')}`);

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { offerId, action, note } = await req.json();
    const entities = base44.asServiceRole.entities;
    const [offer] = await entities.Offer.filter({ id: offerId }, '-created_date', 1);
    if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
    if (offer.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    const isReviewer = ADMIN_ROLES.includes(me.role);
    const cleanNote = note ? String(note).slice(0, 2000) : null;
    const history = Array.isArray(offer.review_history) ? offer.review_history : [];
    const entry = { action, by: me.email, by_name: me.full_name || me.email, note: cleanNote, at: new Date().toISOString() };
    const link = `/Offers?open=${offer.id}`;
    const terms = `<ul><li>Offer: ${money(offer.offer_price)}${offer.list_price ? ` (list ${money(offer.list_price)})` : ''}</li>
<li>Financing: ${esc(offer.financing_type || '-')}</li><li>Closing: ${esc(offer.closing_date || '-')}</li></ul>`;

    if (action === 'request') {
      if (offer.agent_email !== me.email && !isReviewer) return Response.json({ error: 'Only the offer\'s agent can ask for review' }, { status: 403 });
      await entities.Offer.update(offer.id, { review_status: 'requested', review_requested_at: entry.at, review_history: [...history, entry] });
      const reviewers = [...(await admins(entities, offer.brokerage_id)), ...(await withDuty(entities, offer.brokerage_id, 'compliance'))]
        .filter((u) => u.email.toLowerCase() !== me.email.toLowerCase());
      const n = await notifyPeople(entities, {
        brokerageId: offer.brokerage_id, people: reviewers, link, referenceId: offer.id, referenceType: 'Offer',
        title: `Review requested: offer on ${offer.property_address}`,
        message: `${me.full_name || me.email} would like a broker review of their offer on ${offer.property_address} before sending it.`,
        emailBody: `${terms}${cleanNote ? `<p><strong>Note:</strong> ${esc(cleanNote)}</p>` : ''}`,
      });
      return Response.json({ status: 'success', notified: n });
    }

    if (action === 'approve' || action === 'changes') {
      if (!isReviewer) return Response.json({ error: 'Only an admin or broker can review' }, { status: 403 });
      const review_status = action === 'approve' ? 'approved' : 'changes_requested';
      await entities.Offer.update(offer.id, { review_status, reviewed_by: me.email, reviewed_at: entry.at, review_note: cleanNote, review_history: [...history, entry] });
      await notifyPeople(entities, {
        brokerageId: offer.brokerage_id, people: [{ email: offer.agent_email, name: offer.agent_name }], link, referenceId: offer.id, referenceType: 'Offer',
        title: action === 'approve' ? `Approved: your offer on ${offer.property_address}` : `Changes requested: your offer on ${offer.property_address}`,
        message: action === 'approve'
          ? `${me.full_name || me.email} reviewed your offer and it's good to send.`
          : `${me.full_name || me.email} reviewed your offer and asked for changes.`,
        emailBody: cleanNote ? `<p><strong>Note:</strong> ${esc(cleanNote)}</p>` : '',
      });
      return Response.json({ status: 'success', review_status });
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('offerReview:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
