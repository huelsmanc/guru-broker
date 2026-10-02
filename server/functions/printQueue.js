// New (scheduled every 5 minutes): mails the next batch of postcards for big orders, and
// checks shipping on printed orders so agents can see tracking.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { sendPostcards, gelatoOrder, configured } from '../lib/print.js';

const BUDGET_MS = 45_000;

export default async (req) => {
  try {
    createClientFromRequest(req); // scheduled call (service secret) or a signed-in check
    const started = Date.now();
    const db = adminClient();
    const conn = configured();
    const report = { mailed: 0, tracked: 0 };
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
