// Payload (payload.com) for commission payouts by direct deposit.
// Env: PAYLOAD_SECRET_KEY (secret_key_...), PAYLOAD_PROCESSING_ID (your processing account id).
//
// - Bank linking: Payload emails the agent a secure "payment activation" link; they link
//   their bank (verified by Payload) and we store only the resulting payment method id.
// - Payouts: a "credit" transaction from your processing account to that payment method.
// Docs: https://docs.payload.com/ui/payment-activation/ and https://docs.payload.com/apis/payouts/

const BASE = 'https://api.payload.com';

export function payloadConfigured() {
  return !!(process.env.PAYLOAD_SECRET_KEY && process.env.PAYLOAD_PROCESSING_ID);
}

// Payload's API takes form fields with bracket notation, e.g. intent[type]=bank_account.
function formEncode(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? formEncode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(method, path, body) {
  if (!process.env.PAYLOAD_SECRET_KEY) throw new Error('Payload is not set up (PAYLOAD_SECRET_KEY missing)');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.PAYLOAD_SECRET_KEY}:`).toString('base64')}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: body ? formEncode(body).toString() : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error_description || data?.details || data?.message || data?.error_type || `Payload error ${res.status}`;
    throw Object.assign(new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)), { status: 502, payload: data });
  }
  return data;
}

/** Emails the agent Payload's secure link to connect their bank account. */
export function requestBankLink({ name, email, brokerageName }) {
  return call('POST', '/payment_activations', {
    intent: {
      entity_name: brokerageName || 'Guru Broker',
      purpose: 'Receive commission payments by direct deposit',
      type: 'bank_account',
      entity_type: 'individual',
    },
    send_to: [{ name, email }],
  });
}

export function getActivation(id) {
  return call('GET', `/payment_activations/${encodeURIComponent(id)}`);
}

/** Sends money: a credit from your processing account to the agent's linked bank. */
export function sendCredit({ amount, paymentMethodId, name, email, description }) {
  return call('POST', '/transactions', {
    type: 'credit',
    amount: Number(amount).toFixed(2),
    processing_id: process.env.PAYLOAD_PROCESSING_ID,
    payment_method_id: paymentMethodId,
    description: description?.slice(0, 120),
    receipts: email ? [{ name, email }] : undefined,
  });
}

/** Stops a direct deposit that Payload hasn't processed yet. Fails once the money has gone out. */
export function voidCredit(id) {
  return call('PUT', `/transactions/${encodeURIComponent(id)}`, { status: 'voided' });
}

export function getTransaction(id) {
  return call('GET', `/transactions/${encodeURIComponent(id)}`);
}

/** Maps Payload's transaction status to ours. */
export function payoutStatusFrom(txn) {
  const s = String(txn?.status || '').toLowerCase();
  if (['processed', 'paid', 'settled', 'deposited'].includes(s)) return 'paid';
  if (['rejected', 'declined', 'failed', 'voided', 'reversed', 'returned'].includes(s)) return 'failed';
  return 'sent';
}
