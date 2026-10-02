// New (scheduled every 5 minutes): mails the next batch of postcards for big orders, and
// checks shipping on printed orders so agents can see tracking. Also catches card payments the
// webhook missed (and the agent never came back from checkout), and drops checkouts left unpaid.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { sendPostcards, gelatoOrder, configured, getSession, markPaidAndFulfill, refundUndelivered } from '../lib/print.js';

const BUDGET_MS = 45_000;

export default async (req) => {
  try {
    createClientFromRequest(req); // scheduled call (service secret) or a signed-in check
    const started = Date.now();
    const db = adminClient();
    const conn = configured();
    const report = { mailed: 0, tracked: 0, confirmed: 0, expired: 0 };
    if (conn.stripe) {
      const { data: waiting } = await db.from('print_order').select('id, stripe_session_id, created_date').eq('status', 'awaiting_payment').not('stripe_session_id', 'is', null).order('created_date', { ascending: true }).limit(25);
      for (const o of waiting || []) {
        if (Date.now() - started > 15_000) break;
        try {
          const sess = await getSession(o.stripe_session_id);
          if (sess.payment_status === 'paid') { await markPaidAndFulfill(o.id, { paidVia: 'stripe' }); report.confirmed += 1; }
          else if (sess.status === 'expired' || Date.now() - new Date(o.created_date).getTime() > 26 * 3600e3) {
            await db.from('print_order').update({ status: 'cancelled' }).eq('id', o.id).eq('status', 'awaiting_payment'); report.expired += 1;
          }
        } catch (err) { console.error('printQueue payment check', o.id, err.message); }
      }
    }
    if (conn.stripe) {
      // Refunds for undeliverable postcards that weren't issued yet (e.g. orders mailed before this existed).
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const { data: owed } = await db.from('print_order').select('*').in('status', ['mailed', 'failed']).gt('failed_count', 0).not('stripe_session_id', 'is', null).eq('test_mode', false).is('extra->refund', null).gte('created_date', since).limit(20);
      for (const o of owed || []) {
        if (Date.now() - started > 25_000) break;
        try { const r = await refundUndelivered({ ...(o.extra || {}), ...o }); if (r.refund) report.refunded = (report.refunded || 0) + 1; } catch (err) { console.error('printQueue refund', o.id, err.message); }
      }
    }
    if (conn.lob) {
      const { data: mailing } = await db.from('print_order').select('*').in('status', ['mailing']).order('created_date', { ascending: true }).limit(20);
      for (const o of mailing || []) {
        const left = BUDGET_MS - (Date.now() - started);
        if (left < 5000) break;
        const after = await sendPostcards({ ...(o.extra || {}), ...o }, { budgetMs: left - 3000 });
        report.mailed += Number(after.sent_count || 0) - Number(o.sent_count || 0);
      }
    }
    if (conn.gelato && Date.now() - started < BUDGET_MS - 5000) {
      const { data: printing } = await db.from('print_order').select('*').in('status', ['in_production', 'shipped']).order('updated_date', { ascending: true }).limit(15);
      for (const o of printing || []) {
        if (Date.now() - started > BUDGET_MS - 3000) break;
        const id = o.vendor_ids?.gelato;
        if (!id) continue;
        try {
          const g = await gelatoOrder(id);
          const status = String(g.fulfillmentStatus || g.status || '').toLowerCase();
          const shipment = (g.shipment?.packages || g.shipments || [])[0] || g.shipment || {};
          const tracking = { status, carrier: shipment.shipmentMethodName || shipment.carrier || null, code: shipment.trackingCode || shipment.trackingNumber || null, url: shipment.trackingUrl || null };
          const next = /delivered/.test(status) ? 'delivered' : /shipped|in_transit/.test(status) ? 'shipped' : /cancel|failed/.test(status) ? 'needs_attention' : o.status;
          await db.from('print_order').update({ tracking, status: next, ...(next === 'shipped' && !o.fulfilled_at ? { fulfilled_at: new Date().toISOString() } : {}) }).eq('id', o.id);
          report.tracked += 1;
        } catch (err) { console.error('printQueue gelato', o.id, err.message); }
      }
    }
    return Response.json(report);
  } catch (error) {
    console.error('printQueue:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
