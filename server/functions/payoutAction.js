// New: admin payout actions.
//   approve   -> pending_approval -> approved
//   send      -> approved -> sending -> sent (Payload direct deposit)
//   mark_paid -> approved -> paid (paid another way: check, wire)
//   cancel    -> pending_approval/approved/failed -> void
//   void_sent -> sent -> void: asks Payload to stop the direct deposit first; refused if it already went out
//   void_record { memo } -> sent/paid -> void without moving money back (for corrections, after the money
//                was reversed some other way, or a test). Kept with who did it and why.
// Money only moves on 'send', one payout at a time, and never twice.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';
import { sendCredit, payloadConfigured, voidCredit } from '../lib/payload.js';

async function claim(id, from, to, patch = {}) {
  const { data } = await adminClient().from('payout').update({ status: to, ...patch }).eq('id', id).in('status', from).select('*');
  return data?.[0] || null;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!can(me, 'accounting.access')) return Response.json({ error: 'Admins only' }, { status: 403 });
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
      } else if (action === 'void_sent') {
        if (p.status !== 'sent') { results.push({ id, ok: false, error: `Is ${p.status}` }); continue; }
        if (p.payload_transaction_id) {
          try { await voidCredit(p.payload_transaction_id); } catch (err) {
            results.push({ id, ok: false, error: `Payload couldn't stop ${p.payee_name || p.payee_email}'s deposit (it may have already gone out): ${err.message}`, record_only_possible: true }); continue;
          }
        }
        const r = await claim(id, ['sent'], 'void', { payload_status: p.payload_transaction_id ? 'voided' : p.payload_status, extra: { ...(p.extra || {}), voided_by: me.email, voided_at: now, void_how: 'payload' } });
        results.push({ id, ok: !!r, error: r ? null : 'It changed while voiding; refresh' });
      } else if (action === 'void_record') {
        const why = String(memo || '').trim();
        if (!why) { results.push({ id, ok: false, error: 'Say why it is being voided' }); continue; }
        const r = await claim(id, ['sent', 'paid', 'sending'], 'void', { extra: { ...(p.extra || {}), voided_by: me.email, voided_at: now, void_how: 'record_only', void_note: why.slice(0, 300), was: p.status } });
        results.push({ id, ok: !!r, error: r ? null : `Is ${p.status}` });
      } else if (action === 'mark_paid') {
        const r = await claim(id, ['approved', 'failed'], 'paid', { paid_at: now, method: 'manual', extra: { ...(p.extra || {}), paid_note: memo || null, paid_by: me.email } });
        results.push({ id, ok: !!r, error: r ? null : `Is ${p.status}` });
      } else if (action === 'send') {
        if (!payloadConfigured()) { results.push({ id, ok: false, error: 'Payload is not connected' }); continue; }
        const [bank] = await entities.AgentPrivate.filter({ user_email: p.payee_email }, '-created_date', 1);
        if (!bank?.payload_payment_method_id) { results.push({ id, ok: false, error: `${p.payee_email} hasn't linked a bank account` }); continue; }
        if (p.transaction_id) {
          const tx = await entities.Transaction.get(p.transaction_id).catch(() => null);
          if (tx && tx.commission_received_amount == null) { results.push({ id, ok: false, error: 'Mark the commission as received from title first (Finances -> Funds received)' }); continue; }
        }
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
