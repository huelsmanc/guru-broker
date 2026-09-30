// Scheduled every 30 minutes: picks up newly linked bank accounts and updates sent
// payouts as Payload settles or rejects them. Agents are notified when money lands.
import { createClientFromRequest } from '../lib/base44.js';
import { getTransaction, payoutStatusFrom, payloadConfigured } from '../lib/payload.js';
import { refreshActivation } from './bankLink.js';
import { notifyPeople } from '../lib/team.js';

export default async (req) => {
  if (!payloadConfigured()) return Response.json({ status: 'Payload not configured' });
  const entities = createClientFromRequest(req).asServiceRole.entities;
  let linked = 0; let updated = 0;
  const pending = (await entities.AgentPrivate.list('-created_date', 500)).filter((r) => r.payload_activation_id && !r.payload_payment_method_id);
  for (const row of pending) {
    try { const r = await refreshActivation(entities, row); if (r.payload_payment_method_id) linked++; } catch (e) { console.error('activation', e.message); }
  }
  const sent = await entities.Payout.filter({ status: 'sent' }, '-created_date', 500);
  for (const p of sent) {
    if (!p.payload_transaction_id) continue;
    try {
      const txn = await getTransaction(p.payload_transaction_id);
      const status = payoutStatusFrom(txn);
      if (status !== 'sent' || txn.status !== p.payload_status) {
        await entities.Payout.update(p.id, { status, payload_status: txn.status, ...(status === 'paid' ? { paid_at: new Date().toISOString() } : {}), ...(status === 'failed' ? { failure_reason: txn.status_message || txn.status } : {}) });
        updated++;
        if (status === 'paid') {
          await notifyPeople(entities, { brokerageId: p.brokerage_id, people: [{ email: p.payee_email, name: p.payee_name }], link: '/MyCommissions', referenceId: p.id, referenceType: 'Payout',
            title: `Paid: $${Number(p.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, message: `Your payment for ${p.memo || 'a closed deal'} was deposited.` });
        }
      }
    } catch (e) { console.error('payout status', p.id, e.message); }
  }
  return Response.json({ status: 'ok', linked, updated });
};
