// New: the print shop. Agents order mailed postcards (Lob) or printed items shipped to them
// (Gelato) from their designs and pay by card (Stripe Checkout). In test mode nothing is charged,
// printed or mailed. The platform owner sets prices and printer product codes.
//   catalog                                   -> products, prices, what's connected
//   order { product, quantity?, recipients? | list_id?, files, ship_to?, design_id?, transaction_id? }
//                                             -> { checkout_url } or, in test mode, { order }
//   confirm { order_id }                      -> checks the payment after Stripe sends them back
//   cancel { order_id }                       -> drops an unpaid order
//   verify { recipients }                     -> address check (up to 500)
//   settings_save { settings } | check_product { uid } | retry { order_id }   (platform owner)
import { appUrl, createClientFromRequest, adminClient } from '../lib/base44.js';
import { isAdminRole } from '../lib/team.js';
import { parsePath, pathFromUrl } from '../lib/files.js';
import { PRODUCTS, priceFor, cleanAddress, withDefaults } from '../../shared/print.js';
import {
  PrintProblem, configured, lobIsTest, readSettings, saveSettings, checkoutSession, getSession, markPaidAndFulfill, fulfill,
  verifyAddresses, gelatoProduct,
} from '../lib/print.js';

const lc = (e) => String(e || '').toLowerCase().trim();

function ownFile(me, url) {
  const path = pathFromUrl(url);
  const info = path && parsePath(path);
  if (!info || info.kind !== 'user' || info.id !== me.id || info.brokerageId !== me.brokerage_id) throw new PrintProblem('Print files must be made from your design. Try again.');
  return url;
}

// After paying, send the agent back to the address they ordered from (gurubroker.app or one of
// this project's Vercel addresses), so they come back signed in as the same person.
function returnBaseFor(req) {
  const fallback = appUrl();
  try {
    const origin = new URL(req.headers.get('origin') || req.headers.get('referer') || '');
    const app = new URL(fallback);
    const mine = [app.hostname, 'gurubroker.app', ...String(process.env.APP_DOMAINS || '').split(',').map((d) => d.trim()).filter(Boolean)];
    const ok = origin.protocol === 'https:' && (mine.some((h) => origin.hostname === h || origin.hostname === `www.${h}`)
      || (origin.hostname.endsWith('.vercel.app') && origin.hostname.startsWith('guru-broker')));
    return ok ? origin.origin : fallback;
  } catch { return fallback; }
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'catalog';
    const owner = me.role === 'super_admin';
    const db = adminClient();
    const settings = await readSettings();
    const conn = configured();
    const testMode = !!settings.test_mode;

    if (action === 'catalog') {
      return Response.json({
        products: Object.entries(PRODUCTS).map(([key, p]) => ({ key, ...p, prices: settings.prices[key] })),
        test_mode: testMode, connected: conn, lob_test_key: lobIsTest(), is_owner: owner,
        can_pay: testMode || conn.stripe,
        ...(owner ? { settings } : {}),
      });
    }

    if (action === 'settings_save' || action === 'check_product') {
      if (!owner) throw new PrintProblem('Only the platform owner can change print settings.', 403);
      if (action === 'check_product') {
        if (!conn.gelato) throw new PrintProblem('Add GELATO_API_KEY in Vercel first.');
        const p = await gelatoProduct(String(body.uid || ''));
        return Response.json({ ok: true, product: { uid: p.productUid || body.uid, name: p.title || p.name || null, attributes: p.attributes || null } });
      }
      const s = body.settings || {};
      const clean = withDefaults({
        test_mode: !!s.test_mode,
        prices: Object.fromEntries(Object.keys(PRODUCTS).map((k) => [k, Object.fromEntries(Object.entries(s.prices?.[k] || {}).map(([q, v]) => [q, Math.max(0, Math.round(Number(v) || 0))]))])),
        gelato_uids: Object.fromEntries(Object.entries(s.gelato_uids || {}).map(([k, v]) => [k, String(v || '').trim().slice(0, 200)])),
      });
      return Response.json({ settings: await saveSettings(clean) });
    }

    if (action === 'verify') {
      if (!conn.lob) throw new PrintProblem('Address checking turns on once Lob is connected.');
      const list = (Array.isArray(body.recipients) ? body.recipients : []).slice(0, 500).map((a) => cleanAddress(a).address).filter(Boolean);
      return Response.json({ results: await verifyAddresses(list) });
    }

    if (action === 'order') {
      if (!me.brokerage_id) throw new PrintProblem('Join a brokerage first.');
      const key = String(body.product || '');
      const product = PRODUCTS[key];
      if (!product) throw new PrintProblem('Pick a product.');
      if (!testMode && !conn.stripe) throw new PrintProblem("Card payments aren't set up yet. Ask your platform owner.");
      if (product.vendor === 'lob' && !conn.lob) throw new PrintProblem("Mailing isn't connected yet. Ask your platform owner.");
      if (product.vendor === 'gelato' && !conn.gelato) throw new PrintProblem("Printing isn't connected yet. Ask your platform owner.");
      const files = body.files || {};
      const cleanFiles = product.vendor === 'lob' ? { front: ownFile(me, files.front), back: ownFile(me, files.back) } : { pdf: ownFile(me, files.pdf), preview: files.preview ? ownFile(me, files.preview) : undefined };

      let recipients = [];
      let listId = null;
      if (product.mailed) {
        let raw = Array.isArray(body.recipients) ? body.recipients : [];
        if (body.list_id) {
          const [list] = await base44.entities.MailingList.filter({ id: String(body.list_id) }, '-created_date', 1);
          if (!list) throw new PrintProblem('Mailing list not found.', 404);
          raw = list.recipients || []; listId = list.id;
        }
        const seen = new Set();
        recipients = raw.map((a) => cleanAddress(a).address).filter((a) => {
          if (!a) return false;
          const k = `${a.address_line1}|${a.address_line2}|${a.zip}`.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k); return true;
        });
        if (recipients.length < settings.min_recipients) throw new PrintProblem('Add at least one mailing address.');
        if (recipients.length > settings.max_recipients) throw new PrintProblem(`Up to ${settings.max_recipients.toLocaleString()} addresses per order.`);
      }
      let shipTo = null;
      if (body.ship_to) {
        const { address, error } = cleanAddress(body.ship_to);
        if (error && !product.mailed) throw new PrintProblem(`Shipping address: ${error}.`);
        shipTo = address ? { ...address, phone: String(body.ship_to.phone || '').slice(0, 20) || undefined, company: String(body.ship_to.company || '').slice(0, 60) || undefined } : null;
      }
      if (!product.mailed && !shipTo) throw new PrintProblem('Add where to ship your order.');
      const quantity = product.mailed ? recipients.length : Number(body.quantity);
      const amount = priceFor(key, { quantity, recipients: recipients.length }, settings);
      if (amount == null) throw new PrintProblem('Pick one of the listed quantities.');
      if (!testMode && amount < 50) throw new PrintProblem('Orders must be at least $0.50.');

      const { data: order, error } = await db.from('print_order').insert({
        brokerage_id: me.brokerage_id, owner_email: lc(me.email), owner_name: me.display_name || me.full_name || me.email,
        product: key, product_label: product.label, vendor: product.vendor, status: 'awaiting_payment', quantity, recipient_count: recipients.length,
        sent_count: 0, failed_count: 0, amount_cents: amount, currency: 'usd', files: cleanFiles, ship_to: shipTo, recipients, list_id: listId,
        design_id: body.design_id ? String(body.design_id) : null, transaction_id: body.transaction_id ? String(body.transaction_id) : null,
        test_mode: testMode, problems: [], vendor_ids: {}, created_by: lc(me.email),
      }).select('*').single();
      if (error) throw new PrintProblem(error.message, 500);
      if (testMode) return Response.json({ order: await markPaidAndFulfill(order.id, { paidVia: 'test' }), test: true });
      const session = await checkoutSession(order, me.email, returnBaseFor(req));
      await db.from('print_order').update({ stripe_session_id: session.id }).eq('id', order.id);
      return Response.json({ checkout_url: session.url, order_id: order.id });
    }

    const { data: order } = await db.from('print_order').select('*').eq('id', String(body.order_id || '')).maybeSingle();
    const mine = order && (lc(order.owner_email) === lc(me.email) || owner || (isAdminRole(me.role) && order.brokerage_id === me.brokerage_id));
    if (!mine) throw new PrintProblem('Order not found.', 404);

    if (action === 'confirm') {
      if (order.status !== 'awaiting_payment' || !order.stripe_session_id) return Response.json({ order });
      const s = await getSession(order.stripe_session_id);
      if (s.payment_status === 'paid') return Response.json({ order: await markPaidAndFulfill(order.id, { paidVia: 'stripe' }) });
      return Response.json({ order, payment_status: s.payment_status });
    }
    if (action === 'cancel') {
      if (order.status !== 'awaiting_payment') throw new PrintProblem('This order is already paid. Contact your platform owner to cancel it.');
      await db.from('print_order').update({ status: 'cancelled' }).eq('id', order.id).eq('status', 'awaiting_payment');
      return Response.json({ ok: true });
    }
    if (action === 'retry') {
      if (!owner) throw new PrintProblem('Only the platform owner can retry an order.', 403);
      if (order.status !== 'needs_attention') throw new PrintProblem(`This order is ${order.status}.`);
      return Response.json({ order: await fulfill({ ...(order.extra || {}), ...order }) });
    }
    throw new PrintProblem('Unknown action');
  } catch (error) {
    if (!(error instanceof PrintProblem)) console.error('printShop:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
