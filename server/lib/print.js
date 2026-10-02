// Print shop back end: settings, Stripe checkout, Lob (mailed postcards) and Gelato (printed
// items shipped to the agent). Keys live in Vercel: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
// LOB_API_KEY (test_... or live_...), GELATO_API_KEY.
import crypto from 'node:crypto';
import { adminClient, appUrl } from './base44.js';
import { signedUrlFor } from './files.js';
import { PRODUCTS, withDefaults } from '../../shared/print.js';

export class PrintProblem extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const lc = (e) => String(e || '').toLowerCase().trim();

export const configured = () => ({ stripe: !!process.env.STRIPE_SECRET_KEY, lob: !!process.env.LOB_API_KEY, gelato: !!process.env.GELATO_API_KEY, webhook: !!process.env.STRIPE_WEBHOOK_SECRET });
export const lobIsTest = () => String(process.env.LOB_API_KEY || '').startsWith('test_');

export async function readSettings() {
  const { data } = await adminClient().from('app_secret').select('value').eq('name', 'print_settings').maybeSingle();
  return withDefaults(data?.value || {});
}
export async function saveSettings(value) {
  const { error } = await adminClient().from('app_secret').upsert({ name: 'print_settings', value }, { onConflict: 'name' });
  if (error) throw new PrintProblem(error.message, 500);
  return withDefaults(value);
}

// ---- Stripe (plain HTTPS; no SDK) -------------------------------------------------------
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? form(x, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x))));
    else if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method, headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? form(body).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PrintProblem(`Payment: ${data?.error?.message || res.status}`, 502);
  return data;
}

export async function checkoutSession(order, email, returnBase = appUrl()) {
  const session = await stripe('POST', '/checkout/sessions', {
    mode: 'payment',
    customer_email: email,
    client_reference_id: order.id,
    metadata: { order_id: order.id },
    payment_intent_data: { metadata: { order_id: order.id }, description: `${order.product_label} · ${order.id}` },
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: order.amount_cents, product_data: { name: order.product_label, description: order.vendor === 'lob' ? `${order.recipient_count} addresses, postage included` : `Quantity ${order.quantity}` } } }],
    success_url: `${returnBase}/Marketing?tool=print&order=${order.id}&paid=1`,
    cancel_url: `${returnBase}/Marketing?tool=print&order=${order.id}&cancelled=1`,
  });
  return session;
}
export const getSession = (id) => stripe('GET', `/checkout/sessions/${encodeURIComponent(id)}`);

/** Stripe-Signature: t=...,v1=... signed over `${t}.${rawBody}`. */
export function verifyStripeSignature(raw, header, secret = process.env.STRIPE_WEBHOOK_SECRET, toleranceSec = 600) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v]));
  const sigs = String(header).split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3));
  if (!parts.t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > toleranceSec) return false;
  const want = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  return sigs.some((s) => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)));
}

// ---- Lob ------------------------------------------------------------------------------------
async function lob(method, path, body, idem) {
  const res = await fetch(`https://api.lob.com/v1${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.LOB_API_KEY}:`).toString('base64')}`, 'Content-Type': 'application/json', ...(idem ? { 'Idempotency-Key': idem } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PrintProblem(data?.error?.message || `Lob ${res.status}`, res.status >= 500 ? 502 : 400);
  return data;
}
const lobAddr = (a) => ({ name: a.name, address_line1: a.address_line1, address_line2: a.address_line2 || undefined, address_city: a.city, address_state: a.state, address_zip: a.zip, address_country: 'US' });

/** Checks up to 500 addresses (20 per call). Returns [{ ok, deliverability, address }]. */
export async function verifyAddresses(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 20) {
    const chunk = list.slice(i, i + 20);
    const r = await lob('POST', '/bulk/us_verifications', { addresses: chunk.map((a) => ({ primary_line: a.address_line1, secondary_line: a.address_line2 || undefined, city: a.city, state: a.state, zip_code: a.zip })) });
    (r.addresses || []).forEach((v, j) => {
      const orig = chunk[j];
      const d = v.deliverability || 'unknown';
      const ok = ['deliverable', 'deliverable_unnecessary_unit', 'deliverable_incorrect_unit', 'deliverable_missing_unit'].includes(d);
      out.push({ ok, deliverability: d, address: ok ? { ...orig, address_line1: v.primary_line || orig.address_line1, address_line2: v.secondary_line || orig.address_line2 || '', city: v.components?.city || orig.city, state: v.components?.state || orig.state, zip: v.components?.zip_code ? `${v.components.zip_code}${v.components.zip_code_plus_4 ? `-${v.components.zip_code_plus_4}` : ''}` : orig.zip } : orig });
    });
  }
  return out;
}

/** Sends the next postcards of a mailed order, within a time budget. Safe to repeat (idempotency keys). */
export async function sendPostcards(order, { budgetMs = 40_000 } = {}) {
  const started = Date.now();
  const db = adminClient();
  const product = PRODUCTS[order.product];
  const recipients = order.recipients || [];
  const files = order.files || {};
  const [front, back] = await Promise.all([signedUrlFor(files.front, 7 * 86400), signedUrlFor(files.back, 7 * 86400)]);
  let sent = Number(order.sent_count || 0);
  let failed = Number(order.failed_count || 0);
  const problems = [...(order.problems || [])];
  const ids = { ...(order.vendor_ids || {}) };
  let i = sent + failed;
  for (; i < recipients.length && Date.now() - started < budgetMs; i += 1) {
    try {
      const pc = await lob('POST', '/postcards', {
        description: `${order.product_label} · ${order.id}`.slice(0, 255),
        to: lobAddr(recipients[i]),
        ...(order.ship_to?.address_line1 ? { from: lobAddr(order.ship_to) } : {}),
        front, back, size: product.lobSize, use_type: 'marketing',
        metadata: { order_id: order.id },
      }, `${order.id}-${i}`);
      sent += 1;
      if (!ids.first_postcard) { ids.first_postcard = pc.id; ids.expected_delivery = pc.expected_delivery_date || null; ids.preview = pc.url || null; }
    } catch (err) {
      if (err.status === 502) break; // Lob is having trouble: try again next run
      failed += 1;
      if (problems.length < 50) problems.push({ i, address: `${recipients[i].address_line1}, ${recipients[i].city}`, error: String(err.message).slice(0, 200) });
    }
  }
  const done = sent + failed >= recipients.length;
  const patch = { sent_count: sent, failed_count: failed, problems, vendor_ids: ids, status: done ? (sent ? 'mailed' : 'failed') : 'mailing', ...(done ? { fulfilled_at: new Date().toISOString() } : {}) };
  await db.from('print_order').update(patch).eq('id', order.id);
  return { ...order, ...patch };
}

// ---- Gelato ---------------------------------------------------------------------------------
async function gelato(method, url, body) {
  const res = await fetch(url, { method, headers: { 'X-API-KEY': process.env.GELATO_API_KEY, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new PrintProblem(`Printer: ${data?.message || data?.error || res.status}`, res.status >= 500 ? 502 : 400);
  return data;
}
export const gelatoProduct = (uid) => gelato('GET', `https://product.gelatoapis.com/v3/products/${encodeURIComponent(uid)}`);

export async function placeGelatoOrder(order, settings) {
  const uid = settings.gelato_uids?.[order.product];
  if (!uid) throw new PrintProblem('This product is not set up with the printer yet.', 400);
  const ship = order.ship_to || {};
  const [first, ...rest] = String(ship.name || order.owner_name || 'Agent').split(' ');
  const fileUrl = await signedUrlFor(order.files?.pdf, 7 * 86400);
  const g = await gelato('POST', 'https://order.gelatoapis.com/v3/orders', {
    orderType: order.test_mode ? 'draft' : 'order',
    orderReferenceId: order.id,
    customerReferenceId: lc(order.owner_email),
    currency: 'USD',
    items: [{ itemReferenceId: `${order.id}-1`, productUid: uid, quantity: order.quantity, fileUrl }],
    shipmentMethodUid: 'normal',
    shippingAddress: { firstName: first, lastName: rest.join(' ') || first, companyName: ship.company || undefined, addressLine1: ship.address_line1, addressLine2: ship.address_line2 || undefined, city: ship.city, state: ship.state, postCode: ship.zip, country: 'US', email: lc(order.owner_email), phone: ship.phone || undefined },
    metadata: [{ key: 'guru_order', value: order.id }],
  });
  return g;
}
export const gelatoOrder = (id) => gelato('GET', `https://order.gelatoapis.com/v3/orders/${encodeURIComponent(id)}`);

// ---- Payment confirmed: start printing ---------------------------------------------------------
/** Marks an order paid exactly once, then starts fulfillment. Returns the updated order. */
export async function markPaidAndFulfill(orderId, { paidVia } = {}) {
  const db = adminClient();
  const { data: claimed } = await db.from('print_order').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', orderId).eq('status', 'awaiting_payment').select('*');
  const order = claimed?.[0];
  if (!order) { const { data } = await db.from('print_order').select('*').eq('id', orderId).maybeSingle(); return data; }
  const flat = { ...(order.extra || {}), ...order };
  if (paidVia) await db.from('print_order').update({ extra: { ...(order.extra || {}), paid_via: paidVia } }).eq('id', orderId);
  return fulfill(flat);
}

export async function fulfill(order) {
  const db = adminClient();
  try {
    if (order.vendor === 'gelato') {
      const settings = await readSettings();
      const g = await placeGelatoOrder(order, settings);
      const patch = { status: 'in_production', vendor_ids: { ...(order.vendor_ids || {}), gelato: g.id } };
      await db.from('print_order').update(patch).eq('id', order.id);
      return { ...order, ...patch };
    }
    // Mailed postcards: small orders go out now, the rest every few minutes.
    const queued = { ...order, status: 'mailing' };
    await db.from('print_order').update({ status: 'mailing' }).eq('id', order.id);
    if ((order.recipients || []).length <= 30) return sendPostcards(queued, { budgetMs: 20_000 });
    return queued;
  } catch (err) {
    const patch = { status: 'needs_attention', problems: [...(order.problems || []), { error: String(err.message).slice(0, 300), at: new Date().toISOString() }] };
    await db.from('print_order').update(patch).eq('id', order.id);
    return { ...order, ...patch };
  }
}
