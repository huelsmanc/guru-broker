// Onboarding paperwork from the checklist: an admin sends the ICA (agent signs, then the broker
// countersigns) and the W-9 (agent only). The item follows along (sent -> partly signed -> signed
// and approved), the agent signs from inside the app, and the signed W-9 opens only for the
// people allowed (no open-with-key link on the checklist).
import fs from 'node:fs';
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', RESEND_API_KEY: 're', APP_URL: 'https://gurubroker.app', SIGNING_TOKEN_SECRET: 'test-secret' });
const original = fs.readFileSync(new URL('./sample.pdf', import.meta.url));
const emails = [];
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.includes('resend')) { emails.push(JSON.parse(init.body)); return new Response('{"id":"e"}', { status: 200 }); }
  if (url.includes('form.pdf')) return new Response(original, { status: 200 });
  throw new Error('unexpected fetch ' + url);
};
globalThis.__users = { cody: { id: 'u0', email: 'cody@x.com' }, jake: { id: 'u1', email: 'jake@x.com' }, ann: { id: 'u2', email: 'ann@x.com' }, tia: { id: 'u3', email: 'tia@x.com' } };
const ts = '2026-10-01T00:00:00Z';
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'cody@x.com', full_name: 'Cody Huelsman', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u1', email: 'jake@x.com', full_name: 'jake@x.com', display_name: 'Jake Woodward', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u2', email: 'ann@x.com', full_name: 'Ann Agent', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u3', email: 'tia@x.com', full_name: 'Tia TC', role: 'tc', brokerage_id: 'B1', extra: {} },
  ],
  esign_template: [
    { id: 'tICA', brokerage_id: 'B1', title: 'Independent Contractor Agreement', document_url: 'https://files/form.pdf', extra: { roles: ['Agent', 'Broker'] },
      fields: [{ id: 'a1', type: 'signature', x: 10, y: 80, width: 30, hPct: 2, signer_index: 0 }, { id: 'b1', type: 'signature', x: 55, y: 80, width: 30, hPct: 2, signer_index: 1 }] },
    { id: 'tW9', brokerage_id: 'B1', title: 'W-9', document_url: 'https://files/form.pdf', extra: { roles: ['Agent'] },
      fields: [{ id: 'w1', type: 'text', x: 10, y: 40, width: 30, hPct: 2, signer_index: 0, label: 'Tax ID' }, { id: 'w2', type: 'signature', x: 10, y: 80, width: 30, hPct: 2, signer_index: 0 }] },
    { id: 'tFill', brokerage_id: 'B1', title: 'Commission plan', document_url: 'https://files/form.pdf', extra: { roles: ['Agent'] },
      fields: [{ id: 'p1', type: 'text', sender_fill: true, x: 10, y: 40, width: 30, hPct: 2, signer_index: 0 }] },
  ],
  checklist: [{ id: 'cl1', brokerage_id: 'B1', subject_type: 'onboarding', subject_id: 'jake@x.com', subject_email: 'jake@x.com', status: 'open', updated_date: ts, extra: {},
    items: [
      { id: 'ica', title: 'Independent Contractor Agreement', requires_document: true, required: true, esign_template_id: 'tICA', status: 'open', history: [] },
      { id: 'w9', title: 'W-9', requires_document: true, required: true, esign_template_id: 'tW9', status: 'open', history: [] },
      { id: 'plan', title: 'Commission plan', requires_document: true, required: true, esign_template_id: 'tFill', status: 'open', history: [] },
      { id: 'lic', title: 'Copy of license', requires_document: true, required: true, status: 'open', history: [] },
    ] }],
  notification: [],
};
const { POST, GET } = await import('./fn.mjs');
const call = async (name, tok, body) => {
  const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json().catch(() => null) };
};
const item = (id) => __db.checklist[0].items.find((i) => i.id === id);
const sig = 'data:image/png;base64,' + fs.readFileSync(new URL('./sig.png', import.meta.url)).toString('base64');
const tokenFrom = (url) => decodeURIComponent(url.match(/token=([^&]+)/)[1]);

// Agents can't send; admins send everything that has a form in one go.
assert.equal((await call('checklistEsign', 'jake', { action: 'send', checklist_id: 'cl1', item_id: 'ica' })).status, 403);
let r = await call('checklistEsign', 'cody', { action: 'send_all', checklist_id: 'cl1' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.sent.map((x) => x.item).sort(), ['ica', 'w9']);
assert.equal(r.body.failed.length, 1); assert.match(r.body.failed[0].error, /fill in before sending/);
const icaSub = __db.esign_submission.find((s) => s.id === item('ica').esign.submission_id);
assert.deepEqual(icaSub.signers.map((s) => s.email), ['jake@x.com', 'cody@x.com'], 'agent first, then the broker countersigns');
assert.equal(icaSub.signers[0].name, 'Jake Woodward', 'real name, not the email');
assert.equal(item('ica').esign.status, 'sent'); assert.equal(item('w9').esign.status, 'sent');
assert.ok(__db.notification.some((n) => n.user_email === 'jake@x.com' && /Please sign: W-9/.test(n.title) && n.action_url === '/Profile#onboarding'));
assert.equal((await call('checklistEsign', 'cody', { action: 'send', checklist_id: 'cl1', item_id: 'ica' })).status, 409, 'not twice');

// Jake signs the ICA from the app; the broker's turn comes after.
assert.equal((await call('checklistEsign', 'cody', { action: 'my_link', checklist_id: 'cl1', item_id: 'ica' })).status, 409, "not Cody's turn yet");
assert.equal((await call('checklistEsign', 'ann', { action: 'my_link', checklist_id: 'cl1', item_id: 'ica' })).status, 403);
r = await call('checklistEsign', 'jake', { action: 'my_link', checklist_id: 'cl1', item_id: 'ica', back: '/Profile#onboarding' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.match(r.body.url, /^\/sign\?token=.+&back=%2FProfile%23onboarding$/);
assert.equal((await call('checklistEsign', 'jake', { action: 'my_link', checklist_id: 'cl1', item_id: 'ica', back: '//evil.com' })).body.url.includes('back='), false, 'only app paths');
r = await call('submitSignature', null, { submissionToken: tokenFrom((await call('checklistEsign', 'jake', { action: 'my_link', checklist_id: 'cl1', item_id: 'ica' })).body.url), signedFields: [{ field_id: 'a1', value: sig }] });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(item('ica').esign.status, 'partly_signed');
assert.equal(item('ica').status, 'open');

// Cody countersigns: signed copy on the item, approved, checklist moves on.
r = await call('checklistEsign', 'cody', { action: 'my_link', checklist_id: 'cl1', item_id: 'ica' });
r = await call('submitSignature', null, { submissionToken: tokenFrom(r.body.url), signedFields: [{ field_id: 'b1', value: sig }] });
assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.completed, true);
assert.equal(item('ica').esign.status, 'signed'); assert.equal(item('ica').status, 'approved'); assert.equal(item('ica').reviewed_by, 'e-sign');
assert.match(item('ica').document_url, /^\/api\/fn\/viewSignedDocument\?submission_id=[^&]+$/, 'no open-with-key link');

// W-9: Jake signs alone.
r = await call('checklistEsign', 'jake', { action: 'my_link', checklist_id: 'cl1', item_id: 'w9' });
r = await call('submitSignature', null, { submissionToken: tokenFrom(r.body.url), signedFields: [{ field_id: 'w1', value: '123-45-6789' }, { field_id: 'w2', value: sig }] });
assert.equal(r.body.completed, true);
assert.equal(item('w9').status, 'approved');
const w9url = item('w9').document_url;

// The signed W-9 opens for Jake and admins, not for other agents or the TC.
const view = async (tok) => { const st = (await GET(new Request(`https://gurubroker.app${w9url}`, { headers: tok ? { authorization: `Bearer ${tok}` } : {} }))).status; return st < 400 ? 'open' : st; };
assert.equal(await view('jake'), 'open'); assert.equal(await view('cody'), 'open');
const viaCookie = (await GET(new Request(`https://gurubroker.app${w9url}`, { headers: { cookie: 'x=1; gbh_at=jake' } }))).status;
assert.ok(viaCookie < 400, 'opens in a browser tab with the sign-in cookie');
assert.equal(await view('ann'), 403); assert.equal(await view('tia'), 403); assert.equal(await view(null), 403);

// Cancel: the item goes back to open; the link stops working.
__db.checklist[0].items.push({ id: 'pol', title: 'Policy manual', requires_document: true, esign_template_id: 'tW9', status: 'open', history: [] });
await call('checklistEsign', 'cody', { action: 'send', checklist_id: 'cl1', item_id: 'pol' });
r = await call('checklistEsign', 'cody', { action: 'void', checklist_id: 'cl1', item_id: 'pol' });
assert.equal(r.status, 200);
assert.equal(item('pol').esign.status, 'voided');
assert.equal((await call('checklistEsign', 'jake', { action: 'my_link', checklist_id: 'cl1', item_id: 'pol' })).status, 410);
r = await call('checklistEsign', 'cody', { action: 'send', checklist_id: 'cl1', item_id: 'pol' });
assert.equal(r.status, 200, 'can send again after cancelling');
assert.equal((await call('checklistEsign', 'cody', { action: 'send', checklist_id: 'cl1', item_id: 'lic' })).status, 400, 'no form on this item');
console.log('checklist e-sign: all checks passed');
