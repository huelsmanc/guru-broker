// New: delete a deal (brokerage admins only). Agents can change a deal's status, including
// Cancelled, but can't delete it. Removes what only exists for this deal (checklists, deal
// contacts, the deal chat, unpaid commission and payouts); keeps signed documents, offers and
// marketing designs but unlinks them. Refuses if money for the deal has already gone out.
//   { id } -> { deleted: true }
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { isAdminRole } from '../lib/team.js';

const MONEY_OUT = ['sending', 'sent', 'paid'];

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { id } = await req.json().catch(() => ({}));
    if (!id) return Response.json({ error: 'Which deal?' }, { status: 400 });
    if (!isAdminRole(me.role)) return Response.json({ error: 'Only brokers and admins can delete a deal. You can cancel it instead.' }, { status: 403 });

    const db = adminClient();
    const { data: tx } = await db.from('transaction').select('id, brokerage_id, property_address').eq('id', String(id)).maybeSingle();
    if (!tx || (tx.brokerage_id !== me.brokerage_id && me.role !== 'super_admin')) return Response.json({ error: 'Deal not found' }, { status: 404 });

    const { data: payouts = [] } = await db.from('payout').select('id, status').eq('transaction_id', tx.id);
    if ((payouts || []).some((p) => MONEY_OUT.includes(p.status))) {
      return Response.json({ error: 'Payouts for this deal were already sent or paid, so it can\'t be deleted yet. Void them on the Payouts page first (Sent or Paid tab), or cancel the deal instead.' }, { status: 409 });
    }
    const { data: records = [] } = await db.from('commission_record').select('id, status').eq('transaction_id', tx.id);
    if ((records || []).some((r) => r.status === 'paid')) {
      return Response.json({ error: 'This deal\'s commission was already paid, so it can\'t be deleted. Cancel it instead.' }, { status: 409 });
    }

    const check = (r) => { if (r?.error) throw new Error(r.error.message); };
    // Deal chat and its messages.
    const { data: chats = [] } = await db.from('group_chat').select('id').eq('transaction_id', tx.id);
    const chatIds = (chats || []).map((c) => c.id);
    if (chatIds.length) {
      check(await db.from('group_message').delete().in('group_id', chatIds));
      check(await db.from('group_chat').delete().in('id', chatIds));
    }
    check(await db.from('checklist').delete().eq('subject_type', 'transaction').eq('subject_id', tx.id));
    check(await db.from('transaction_contact').delete().eq('transaction_id', tx.id));
    check(await db.from('payout').delete().eq('transaction_id', tx.id));
    check(await db.from('commission_record').delete().eq('transaction_id', tx.id));
    // Keep these; they stand on their own.
    for (const t of ['offer', 'esign_document', 'marketing_design']) check(await db.from(t).update({ transaction_id: null }).eq('transaction_id', tx.id));
    check(await db.from('transaction').delete().eq('id', tx.id));
    return Response.json({ deleted: true, address: tx.property_address });
  } catch (error) {
    console.error('deleteTransaction:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
