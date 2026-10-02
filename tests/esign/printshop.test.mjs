// Print shop: ordering in test mode and with Stripe, files must be the agent's own, Lob postcards
// (batched, idempotent), Gelato orders, the Stripe webhook signature, and owner-only settings.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app',
  LOB_API_KEY: 'test_lob', GELATO_API_KEY: 'gk', STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_1' });
globalThis.__lenientSign = true;
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const body = init.body ? (String(init.headers?.['Content-Type'] || init.headers?.['content-type'] || '').includes('json') ? JSON.parse(init.body) : String(init.body)) : null;
  calls.push({ url, method: init.method, body, headers: init.headers || {} });
  if (url === 'https://api.lob.com/v1/postcards') {
    if (body.to.address_line1.includes('BAD')) return new Response(JSON.stringify({ error: { message: 'address undeliverable' } }), { status: 422 });
    return Response.json({ id: `psc_${calls.length}`, expected_delivery_date: '2026-10-10', url: 'https://lob/preview.pdf' });
  }
  if (url.startsWith('https://api.lob.com/v1/bulk/us_verifications')) return Response.json({ addresses: body.addresses.map((a) => ({ deliverability: a.primary_line.includes('BAD') ? 'undeliverable' : 'deliverable', primary_line: a.primary_line.toUpperCase(), components: { city: a.city, state: a.state, zip_code: a.zip_code } })) });
  if (url === 'https://order.gelatoapis.com/v3/orders') return Response.json({ id: 'gel_1' });
  if (url.startsWith('https://order.gelatoapis.com/v3/orders/gel_1')) return Response.json({ id: 'gel_1', fulfillmentStatus: 'shipped', shipment: { packages: [{ trackingCode: '1Z999', trackingUrl: 'https://ups/1Z999' }] } });
  if (url.startsWith('https://product.gelatoapis.com/v3/products/')) return Response.json({ productUid: 'x', title: 'Business cards' });
  if (url === 'https://api.stripe.com/v1/checkout/sessions') return Response.json({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' });
  if (url.startsWith('https://api.stripe.com/v1/checkout/sessions/cs_1')) return Response.json({ id: 'cs_1', payment_status: globalThis.__paid ? 'paid' : 'unpaid' });
  throw new Error('unexpected ' + url);
};
globalThis.__users = { ann: { id: 'u1', email: 'ann@x.com' }, root: { id: 'u0', email: 'root@x.com' }, bob: { id: 'u4', email: 'bob@x.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u4', email: 'bob@x.com', full_name: 'Bob', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u0', email: 'root@x.com', full_name: 'Root', role: 'super_admin', brokerage_id: 'B1', extra: {} },
  ],
  print_order: [], mailing_list: [], app_secret: [],
};
const { POST } = await import('./fn.mjs');
const call = (tok, body) => POST(new Request('https://gurubroker.app/api/fn/printShop', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const f = (uid, name) => `/api/file?p=${encodeURIComponent(`scoped/B1/user/${uid}/${name}`)}`;
const files = { front: f('u1', 'front.png'), back: f('u1', 'back.png') };
const addr = (i) => ({ name: `Owner ${i}`, address_line1: `${i} Elm St`, city: 'Chester', state: 'ct', zip: '06412' });

let r = await call('ann', { action: 'catalog' });
assert.equal(r.body.test_mode, true, 'starts in test mode'); assert.equal(r.body.is_owner, false); assert.equal(r.body.settings, undefined);
assert.ok(r.body.products.some((p) => p.key === 'postcard_4x6'));

// Files must be the agent's own.
r = await call('ann', { action: 'order', product: 'postcard_4x6', files: { front: f('u4', 'x.png'), back: files.back }, recipients: [addr(1)] });
assert.equal(r.status, 400);
// Test mode: nothing charged; small orders mail right away (Lob test key).
r = await call('ann', { action: 'order', product: 'postcard_4x6', files, recipients: [addr(1), addr(2), { ...addr(3), address_line1: '3 BAD Rd' }, addr(1), { name: 'x' }] });
assert.equal(r.status, 200, JSON.stringify(r.body));
let o = r.body.order;
assert.equal(o.status, 'mailed'); assert.equal(o.recipient_count, 3, 'duplicates and bad rows dropped'); assert.equal(o.sent_count, 2); assert.equal(o.failed_count, 1);
assert.equal(o.amount_cents, 119 * 3); assert.equal(o.test_mode, true);
const pc = calls.filter((c) => c.url === 'https://api.lob.com/v1/postcards');
assert.equal(pc[0].body.size, '4x6'); assert.equal(pc[0].body.use_type, 'marketing'); assert.equal(pc[0].body.to.address_state, 'CT');
assert.ok(pc[0].body.front.startsWith('https://storage.test/private-files/scoped/B1/user/u1/front.png'));
assert.equal(pc[0].headers['Idempotency-Key'], `${o.id}-0`);
assert.ok(!calls.some((c) => c.url.includes('stripe')), 'no charge in test mode');

// Owner-only settings; turn test mode off.
r = await call('ann', { action: 'settings_save', settings: { test_mode: false } });
assert.equal(r.status, 403);
r = await call('root', { action: 'check_product', uid: 'cards_x' });
assert.equal(r.body.ok, true);
r = await call('root', { action: 'catalog' });
const s = r.body.settings; s.test_mode = false; s.prices.business_cards['250'] = 5000;
r = await call('root', { action: 'settings_save', settings: s });
assert.equal(r.body.settings.test_mode, false); assert.equal(r.body.settings.prices.business_cards['250'], 5000);

// Live: business cards go to Stripe checkout, then Gelato once paid.
r = await call('ann', { action: 'order', product: 'business_cards', quantity: 300, files: { pdf: f('u1', 'cards.pdf') }, ship_to: addr(9) });
assert.equal(r.status, 400, 'only listed quantities');
r = await call('ann', { action: 'order', product: 'business_cards', quantity: 250, files: { pdf: f('u1', 'cards.pdf') }, ship_to: { ...addr(9), name: 'Ann Agent' } });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.checkout_url, 'https://checkout.stripe.com/cs_1');
const stripeCall = calls.find((c) => c.url === 'https://api.stripe.com/v1/checkout/sessions');
assert.match(stripeCall.body, /unit_amount%5D=5000/); assert.match(stripeCall.body, /metadata%5Border_id%5D=/);
const orderId = r.body.order_id;
r = await call('ann', { action: 'confirm', order_id: orderId });
assert.equal(r.body.order.status, 'awaiting_payment');
r = await call('bob', { action: 'confirm', order_id: orderId });
assert.equal(r.status, 404, "someone else's order");

// Webhook: bad signature refused; good one marks paid and orders from Gelato once.
const hook = (raw, sig) => POST(new Request('https://gurubroker.app/api/fn/stripeWebhook', { method: 'POST', headers: { 'stripe-signature': sig }, body: raw })).then((x) => x.status);
const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', metadata: { order_id: orderId } } } });
assert.equal(await hook(raw, 't=1,v1=00'), 400);
const t = Math.floor(Date.now() / 1000);
const sig = `t=${t},v1=${crypto.createHmac('sha256', 'whsec_1').update(`${t}.${raw}`).digest('hex')}`;
assert.equal(await hook(raw, sig), 200);
assert.equal(await hook(raw, sig), 200, 'repeat is harmless');
assert.equal(calls.filter((c) => c.url === 'https://order.gelatoapis.com/v3/orders').length, 1, 'ordered from the printer once');
const gel = calls.find((c) => c.url === 'https://order.gelatoapis.com/v3/orders').body;
assert.equal(gel.orderType, 'order'); assert.equal(gel.items[0].quantity, 250); assert.equal(gel.shippingAddress.firstName, 'Ann');
o = __db.print_order.find((x) => x.id === orderId);
assert.equal(o.status, 'in_production'); assert.equal(o.vendor_ids.gelato, 'gel_1');

// The scheduled job picks up tracking and mails big orders in batches.
const svc = () => POST(new Request('https://gurubroker.app/api/fn/printQueue', { method: 'POST', headers: { 'x-gbh-service': 'hs' } })).then((x) => x.json());
assert.equal((await POST(new Request('https://gurubroker.app/api/fn/printQueue', { method: 'POST' }))).status, 403, 'scheduled only');
await svc();
o = __db.print_order.find((x) => x.id === orderId);
assert.equal(o.status, 'shipped'); assert.equal(o.tracking.code, '1Z999');
// Address check
r = await call('ann', { action: 'verify', recipients: [addr(1), { ...addr(2), address_line1: '2 BAD Way' }] });
assert.deepEqual(r.body.results.map((x) => x.ok), [true, false]);
// Cancel only unpaid
r = await call('ann', { action: 'cancel', order_id: orderId });
assert.equal(r.status, 400);
console.log('print shop: all checks passed');
