// New: admin payout actions.
//   approve   -> pending_approval -> approved
//   send      -> approved -> sending -> sent (Payload direct deposit)
//   mark_paid -> approved -> paid (paid another way: check, wire)
//   cancel    -> pending_approval/approved -> void
// Money only moves on 'send', one payout at a time, and never twice.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { ADMIN_ROLES } from '../lib/team.js';
import { sendCredit, payloadConfigured } from '../lib/payload.js';

async function claim(id, from, to, patch = {}) {
  const { data } = await adminClient().from('payout').update({ status: to, ...patch }).eq('id', id).in('status', from).select('*');
  return data?.[0] || null;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!ADMIN_ROLES.includes(me.role)) return Response.json({ error: 'Admins only' }, { status: 403 });
    const { payoutIds = [], action, memo } = await req.json();
    const entities = base44.asServiceRole.entities;
    const results = [];
    for (const id of payoutIds.slice(0, 100)) {
      const [p] = await entities.Payout.filter({ id }, '-created_date', 1);
      if (!p || (p.brokerage_id !== me.brokerage_id && me.role !== 'super_admin')) { results.push({ id, ok: false, error: 'Not found' }); continue; }
      const now = new Date().toISOString();
      if (action === 'approve') {
        const r = await claim(id, ['pending_approval'], 'approved', { approved_by: me.email, approved_at: now });
        results.push({ id, ok: !!r, error: r ? null : `Is ${p.status}` });
      } else if (action === 'cancel') {
        const r = await claim(id, ['pending_approval', 'approved', 'failed'], 'void');
        results.push({ id, ok: !!r, error: r ? null : `Is ${p.status}` });
      } else if (action === 'mark_paid') {
        const r = await claim(id, ['approved', 'failed'], 'paid', { paid_at: now, method: 'manual', extra: { ...(p.extra || {}), paid_note: memo || null, paid_by: me.email } });
        results.push({ id, ok: !!r, error: r ? null : `Is ${p.status}` });
      } else if (action === 'send') {
        if (!payloadConfigured()) { results.push({ id, ok: false, error: 'Payload is not connected' }); continue; }
        const [bank] = await entities.AgentPrivate.filter({ user_email: p.payee_email }, '-created_date', 1);
        if (!bank?.payload_payment_method_id) { results.push({ id, ok: false, error: `${p.payee_email} hasn't linked a bank account` }); continue; }
        const r = await claim(id, ['approved'], 'sending', { sent_at: now, method: 'payload' });
        if (!r) { results.push({ id, ok: false, error: `Is ${p.status}; approve it first` }); continue; }
        try {
          const txn = await sendCredit({ amount: p.amount, paymentMethodId: bank.payload_payment_method_id, name: p.payee_name, email: p.payee_email, description: p.memo || 'Commission' });
          await entities.Payout.update(id, { status: 'sent', payload_transaction_id: txn.id, payload_status: txn.status || null });
          results.push({ id, ok: true });
        } catch (err) {
          await entities.Payout.update(id, { status: 'failed', failure_reason: String(err.message).slice(0, 300) });
          results.push({ id, ok: false, error: err.message });
        }
      } else {
        results.push({ id, ok: false, error: 'Unknown action' });
      }
    }
    return Response.json({ results });
  } catch (error) {
    console.error('payoutAction:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
