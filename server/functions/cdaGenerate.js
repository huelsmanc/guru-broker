// New: Commission Disbursement Authorization (CDA) PDF for the title company / closing
// attorney, from the saved commission calculation. Returns a short-lived link and the
// public URL to send it through e-sign for the broker's signature.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';
import { createDoc, money } from '../lib/pdfdoc.js';
import { storePrivate, scopeFolder } from '../lib/files.js';
import { dealAppend } from '../../shared/dealAppend.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!can(me, 'accounting.access')) return Response.json({ error: 'Admins only' }, { status: 403 });
    const { transactionId } = await req.json();
    const entities = base44.asServiceRole.entities;
    const tx = await entities.Transaction.get(transactionId);
    if (tx.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    const payouts = (await entities.Payout.filter({ transaction_id: tx.id }, 'created_date', 200)).filter((p) => p.status !== 'void');
    if (!payouts.length) return Response.json({ error: 'Close out the commission first (Calculate & save)' }, { status: 400 });
    const [settings] = await entities.BrokerageSettings.filter({ brokerage_id: tx.brokerage_id }, '-created_date', 1);
    const totals = tx.commission_calc || {};
    const brokerageName = settings?.brokerage_name || 'Brokerage';

    const doc = await createDoc();
    doc.title('Commission Disbursement Authorization', `${brokerageName}${settings?.brokerage_phone ? ` | ${settings.brokerage_phone}` : ''}`);
    doc.text(`Property: ${tx.property_address || ''}`, { isBold: true });
    doc.text(`Buyer(s): ${(tx.buyers || []).join(', ') || '-'}    Seller(s): ${(tx.sellers || []).join(', ') || '-'}`);
    doc.text(`Sale price: ${money(tx.sale_price)}    Closing date: ${tx.closing_date || tx.closed_date || '-'}`);
    if (tx.title_company) doc.text(`Settlement agent: ${tx.title_company}`);
    doc.space(6);
    doc.text(`Total commission due to ${brokerageName}: ${money(totals.gross ?? tx.commission_amount)}`, { isBold: true, size: 11 });
    doc.heading('Please disburse as follows');
    const cols = (a, b, c) => [{ text: a, width: 250 }, { text: b, width: 162 }, { text: c, width: 100, align: 'right' }];
    doc.row(cols('Payee', 'For', 'Amount'), { isBold: true });
    const rows = [];
    const referral = payouts.filter((p) => p.kind === 'referral');
    for (const p of referral) rows.push([p.payee_email, 'Referral fee', p.amount]);
    // Title pays the brokerage; agents are paid by the brokerage unless the brokerage allows direct pay.
    const direct = settings?.cda_direct_agent_pay === true;
    const agentPays = payouts.filter((p) => p.kind === 'agent');
    const toBrokerage = Number(totals.gross ?? 0) - referral.reduce((s, p) => s + Number(p.amount), 0) - (direct ? agentPays.reduce((s, p) => s + Number(p.amount), 0) : 0);
    if (direct) for (const p of agentPays) rows.push([`${p.payee_name || p.payee_email}`, 'Agent commission', p.amount]);
    rows.push([brokerageName, direct ? 'Brokerage commission' : 'Commission (brokerage pays its agents)', toBrokerage]);
    for (const [a, b, c] of rows) doc.row(cols(a, b, money(c)));
    doc.rule();
    doc.row(cols('Total', '', money(rows.reduce((s, r) => s + Number(r[2]), 0))), { isBold: true });
    doc.space(10);
    doc.text('The undersigned broker authorizes the settlement agent to disburse the commission as shown above.', { size: 9 });
    doc.signatureLine(`Broker, ${brokerageName}`);

    const bytes = await doc.save();
    // Private to the deal: only people who can see this transaction can open it.
    const url = await storePrivate(scopeFolder(tx.brokerage_id, { kind: 'tx', id: tx.id }), `CDA-${String(tx.property_address || tx.id).split(',')[0]}.pdf`, bytes, 'application/pdf');
    await dealAppend(adminClient(), tx.id, 'documents', { name: 'CDA (commission disbursement authorization)', url, uploaded_at: new Date().toISOString(), uploaded_by: me.full_name || me.email });
    return Response.json({ status: 'success', url });
  } catch (error) {
    console.error('cdaGenerate:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
