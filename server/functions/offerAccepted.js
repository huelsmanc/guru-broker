// New: "Offer accepted". Creates the transaction from the offer, assigns a transaction
// coordinator (TC), adds the checklists the agent picked, and notifies the TC and everyone with the
// compliance duty.
// TC choice: the one picked in the dialog -> the agent's own TC -> the brokerage default ->
// the team member with the TC duty who has the fewest open files.
import { createClientFromRequest } from '../lib/base44.js';
import { esc } from '../lib/esign.js';
import { applyTemplate } from '../lib/checklists.js';
import { withDuty, leastLoadedTc, notifyPeople, isAdminRole } from '../lib/team.js';

const addDays = (iso, days) => {
  if (!iso || !days) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
};

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { offerId, acceptanceDate, tcEmail, finalPrice, templateIds } = await req.json();
    const entities = base44.asServiceRole.entities;
    const [offer] = await entities.Offer.filter({ id: offerId }, '-created_date', 1);
    if (!offer) return Response.json({ error: 'Offer not found' }, { status: 404 });
    const isAdmin = isAdminRole(me.role);
    if (offer.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    if (!isAdmin && offer.agent_email !== me.email) return Response.json({ error: 'Only the offer\'s agent or an admin can do this' }, { status: 403 });
    if (offer.transaction_id) return Response.json({ status: 'exists', transaction_id: offer.transaction_id });

    // Checklists the agent picked (validated before anything is created).
    const picked = [...new Set(Array.isArray(templateIds) ? templateIds : [])].slice(0, 10);
    const templates = [];
    for (const id of picked) {
      const [t] = await entities.ChecklistTemplate.filter({ id }, '-created_date', 1);
      if (!t || t.brokerage_id !== offer.brokerage_id || (t.kind || 'transaction') !== 'transaction') return Response.json({ error: 'Checklist template not found' }, { status: 400 });
      templates.push(t);
    }

    const accepted = acceptanceDate || new Date().toISOString().slice(0, 10);
    const [settings] = await entities.BrokerageSettings.filter({ brokerage_id: offer.brokerage_id }, '-created_date', 1);
    let tc = null;
    const [agentProfile] = await entities.User.filter({ email: offer.agent_email }, '-created_date', 1);
    const pickEmail = tcEmail || agentProfile?.tc_email || settings?.default_tc_email;
    if (pickEmail) {
      const [u] = await entities.User.filter({ email: pickEmail }, '-created_date', 1);
      tc = { email: pickEmail, name: u?.display_name || u?.full_name || settings?.default_tc_name || pickEmail };
    } else {
      tc = await leastLoadedTc(entities, offer.brokerage_id);
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
      documents,
      updates: [{ id: Date.now().toString(), message: `Offer accepted ${accepted}. Transaction opened from the offer.`, milestone: 'Under Contract', posted_by: me.full_name || me.email, posted_at: new Date().toISOString() }],
      // extra
      transaction_type: 'purchase',
      deal_type: 'buyer',
      acceptance_date: accepted,
      earnest_money: offer.earnest_money,
      financing_type: offer.financing_type,
      mls_number: offer.mls_number,
      offer_id: offer.id,
    });

    const checklists = [];
    for (const t of templates) {
      checklists.push(await applyTemplate(entities, t, { brokerageId: offer.brokerage_id, subjectType: 'transaction', subjectId: tx.id, owner: String(offer.agent_email || '').toLowerCase() }));
    }

    await entities.Offer.update(offer.id, { status: 'accepted', accepted_at: new Date().toISOString(), acceptance_date: accepted, transaction_id: tx.id });

    const compliance = await withDuty(entities, offer.brokerage_id, 'compliance');
    const summary = `<ul>
<li>Price: $${Number(price || 0).toLocaleString('en-US')}</li>
<li>Agent: ${esc(offer.agent_name || offer.agent_email)}</li>
<li>Buyer(s): ${esc((tx.buyers || []).join(', ') || '-')}</li>
<li>Closing: ${esc(tx.closing_date || 'TBD')}</li>
<li>Inspection deadline: ${esc(tx.inspection_contingency_date || '-')}</li>
<li>Financing deadline: ${esc(tx.financing_contingency_date || '-')}</li>
<li>TC: ${esc(tc?.name || 'not assigned yet')}</li>
<li>Checklist: ${esc(templates.map((t) => t.name).join(', ') || 'none picked yet')}</li>
</ul><p style="font-size:12px;color:#6b7280">Deadline reminders are on.</p>`;
    const link = `/Transactions/${tx.id}?tab=checklists`;
    if (tc) {
      await notifyPeople(entities, {
        brokerageId: offer.brokerage_id, people: [tc], link, referenceId: tx.id, referenceType: 'Transaction',
        title: `New transaction: ${tx.property_address}`,
        message: `The offer on ${tx.property_address} was accepted on ${accepted}. You're the transaction coordinator.`,
        emailBody: summary,
      });
    }
    await notifyPeople(entities, {
      brokerageId: offer.brokerage_id,
      people: compliance.filter((c) => c.email.toLowerCase() !== String(tc?.email || '').toLowerCase()),
      link, referenceId: tx.id, referenceType: 'Transaction',
      title: `Under contract: ${tx.property_address}`,
      message: `A new transaction was opened from an accepted offer and needs compliance review.`,
      emailBody: summary,
    });

    return Response.json({ status: 'success', transaction_id: tx.id, tc, checklists: checklists.map((c) => c.id) });
  } catch (error) {
    console.error('offerAccepted:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
