import fs from 'node:fs';
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', RESEND_API_KEY: 're', APP_URL: 'https://gurubroker.app', SIGNING_TOKEN_SECRET: 'test-secret' });
const tokenIn = (e) => decodeURIComponent(e.html.match(/sign\?token=([A-Za-z0-9%]+)/)[1]);
const original = fs.readFileSync(new URL('./sample.pdf', import.meta.url)); // any PDF works as the "original"
const emails = [];
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.includes('resend')) { emails.push(JSON.parse(init.body)); return new Response('{"id":"e"}', { status: 200 }); }
  if (url.includes('original.pdf')) return new Response(original, { status: 200 });
  throw new Error('unexpected fetch ' + url);
};
globalThis.__users = { agentTok: { id: 'u1', email: 'ann@x.com' } };
globalThis.__db = {
  profiles: [{ id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', extra: {} }],
  esign_document: [{ id: 'doc1', brokerage_id: 'B1', title: 'Offer <b>12 Elm</b>', document_url: 'https://files/original.pdf', extra: {},
    signers: [{ name: 'Bob', email: 'bob@x.com' }, { name: 'Sue', email: 'sue@x.com' }],
    fields: [
      { id: 'f1', type: 'signature', x: 10, y: 30, width: 30, hPct: 2, signer_index: 0 },
      { id: 'f2', type: 'date', x: 50, y: 30, width: 15, hPct: 1.2, signer_index: 0 },
      { id: 'f3', type: 'initial', x: 80, y: 70, width: 8, hPct: 1.5, signer_index: 1 },
    ] }],
  transaction: [{ id: 'tx1', brokerage_id: 'B1', documents: [], esign_docs: [{ submission_id: null }], extra: {} }],
};
const { POST } = await import('./fn.mjs');
const call = async (name, body, headers = {}) => {
  const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9', ...headers }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json().catch(() => null) };
};
const sig = 'data:image/png;base64,' + fs.readFileSync(new URL('./sig.png', import.meta.url)).toString('base64');

let r = await call('createESignSubmission', { documentId: 'doc1', signers: [{ name: 'Bob', email: 'bob@x.com' }, { name: 'Sue', email: 'sue@x.com' }] });
assert.equal(r.status, 401, 'send requires sign-in');

r = await call('createESignSubmission', { documentId: 'doc1', sequenceType: 'sequential', transactionId: 'tx1', message: 'Please sign <today>',
  signers: [{ name: 'Bob', email: 'bob@x.com' }, { name: 'Sue', email: 'sue@x.com' }] }, { authorization: 'Bearer agentTok' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(emails.length, 1, 'in order: only the first signer is emailed');
assert.equal(emails[0].to[0], 'bob@x.com');
assert.ok(!emails[0].html.includes('<b>12 Elm</b>'), 'title is escaped in email');
const sub = globalThis.__db.esign_submission[0];
assert.equal(sub.brokerage_id, 'B1');
assert.ok(sub.signers.every((s) => !s.token && s.token_hash && s.token_enc), 'link codes are not stored in plain text');
const bob = { token: tokenIn(emails[0]) };

r = await call('getSubmissionByToken', { token: bob.token });
assert.equal(r.status, 200); assert.equal(r.body.signerIndex, 0); assert.equal(r.body.signer.email, 'bob@x.com');
assert.ok(!JSON.stringify(r.body).includes('token'), 'no link codes are sent to the browser');

r = await call('submitSignature', { submissionToken: bob.token, signedFields: [{ field_id: 'f1', value: sig }] });
assert.equal(r.status, 400, 'missing required date is rejected');
r = await call('submitSignature', { submissionToken: bob.token, signedFields: [{ field_id: 'f1', value: 'javascript:alert(1)' }, { field_id: 'f2', value: '09/30/2026' }] });
assert.equal(r.status, 400, 'non-image signature rejected');
r = await call('submitSignature', { submissionToken: 'nope-nope-nope-nope', signedFields: [] });
assert.equal(r.status, 404);

r = await call('submitSignature', { submissionToken: bob.token, signedFields: [{ field_id: 'f1', value: sig }, { field_id: 'f2', value: '09/30/2026' }, { field_id: 'f3', value: sig }] });
assert.equal(r.status, 200); assert.equal(r.body.completed, false);
assert.equal(emails.at(-1).to[0], 'sue@x.com', 'Sue emailed after Bob signs');
const sue = { token: tokenIn(emails.at(-1)) };
r = await call('submitSignature', { submissionToken: bob.token, signedFields: [{ field_id: 'f1', value: sig }, { field_id: 'f2', value: 'x' }] });
assert.equal(r.status, 409, 'no double signing');

r = await call('submitSignature', { submissionToken: sue.token, signedFields: [{ field_id: 'f3', value: sig }] });
assert.equal(r.status, 200); assert.equal(r.body.completed, true);

const done = globalThis.__db.esign_submission[0];
assert.equal(done.status, 'completed');
assert.ok(done.extra.signed_pdf_path, 'signed PDF stored: ' + JSON.stringify(done.extra.finalize_error));
const pdfBytes = globalThis.__storage['private-files/' + done.extra.signed_pdf_path.replace('private-files/', '')];
fs.writeFileSync(new URL('./out-signed.pdf', import.meta.url), pdfBytes);
const completion = emails.filter((e) => e.subject.startsWith('Completed'));
assert.equal(completion.length, 3, 'sender + 2 signers get the signed PDF');
assert.ok(completion.every((e) => e.attachments?.[0]?.filename.endsWith('signed.pdf')));
const tx = globalThis.__db.transaction[0];
assert.ok(tx.documents.some((d) => d.submission_id === done.id), 'attached to transaction');
assert.ok(done.signers.every((s) => s.ip_address === '9.9.9.9'), 'server-recorded IP');
const audit = globalThis.__db.esign_audit_log.map((a) => a.action);
assert.deepEqual(audit, ['sent', 'viewed', 'signed', 'signed', 'completed']);

// signed document link: needs the key
r = await POST(new Request(`https://gurubroker.app/api/fn/viewSignedDocument?submission_id=${done.id}&key=wrong`, { method: 'GET' }));
assert.equal(r.status, 403);
r = await POST(new Request(done.signed_document_url, { method: 'GET' }));
assert.equal(r.status, 302); assert.ok(r.headers.get('location').includes('signed/'));

// old emailed link redirects to the new page
r = await POST(new Request(`https://gurubroker.app/api/fn/signingPage?token=${sue.token}`, { method: 'GET' }));
assert.equal(r.status, 302); assert.ok(r.headers.get('location').startsWith('https://gurubroker.app/sign?token='));

console.log('e-sign flow: all checks passed');
console.log('emails:', emails.map((e) => `${e.to[0]} | ${e.subject}`).join('\n        '));
