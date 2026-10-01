// E-sign upgrades: new field types, conditions, email code, attachments, in-person,
// nudges, packets, preflight checks, seal + public verify.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', RESEND_API_KEY: 're', APP_URL: 'https://gurubroker.app', SIGNING_TOKEN_SECRET: 'test-secret' });
const tokenIn = (e) => decodeURIComponent(e.html.match(/sign\?token=([A-Za-z0-9%]+)/)[1]);
const original = fs.readFileSync(new URL('./sample.pdf', import.meta.url));
const png = fs.readFileSync(new URL('./sig.png', import.meta.url));
const emails = [];
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.includes('resend')) { emails.push(JSON.parse(init.body)); return new Response('{"id":"e"}', { status: 200 }); }
  if (url.includes('original.pdf')) return new Response(original, { status: 200 });
  throw new Error('unexpected fetch ' + url);
};
globalThis.__users = { agentTok: { id: 'u1', email: 'ann@x.com' }, otherTok: { id: 'u9', email: 'zed@y.com' } };
globalThis.__storage ||= {};
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'zed@y.com', full_name: 'Zed', role: 'user', brokerage_id: 'B2', extra: {} },
  ],
  checklist: [{ id: 'cl1', brokerage_id: 'B1', subject_type: 'transaction', subject_id: 'tx1', items: [{ id: 'ad', title: 'Addendum', requires_document: true, status: 'open', history: [] }], extra: {} }],
  esign_document: [{ id: 'doc2', brokerage_id: 'B1', title: 'Addendum', document_url: 'https://files/original.pdf', transaction_id: 'tx1',
    signers: [{ name: 'Bob', email: 'bob@x.com' }],
    fields: [
      { id: 's', type: 'signature', x: 10, y: 30, width: 30, hPct: 2, signer_index: 0 },
      { id: 'cb', type: 'checkbox', x: 10, y: 40, width: 3, hPct: 1, signer_index: 0 },
      { id: 'r1', type: 'radio', group: 'loan', label: 'Cash', x: 10, y: 45, width: 3, hPct: 1, signer_index: 0 },
      { id: 'r2', type: 'radio', group: 'loan', label: 'Loan', x: 20, y: 45, width: 3, hPct: 1, signer_index: 0 },
      { id: 'lender', type: 'text', x: 30, y: 45, width: 20, hPct: 1, signer_index: 0, show_if: { field_id: 'r2' } },
      { id: 'dd', type: 'dropdown', options: ['30 days', '45 days'], x: 10, y: 50, width: 15, hPct: 1, signer_index: 0 },
      { id: 'pof', type: 'attachment', x: 10, y: 55, width: 20, hPct: 1, signer_index: 0, required: false },
    ] }],
  transaction: [{ id: 'tx1', brokerage_id: 'B1', agent_email: 'ann@x.com', documents: [], extra: {} }],
};
const { POST } = await import('./fn.mjs');
const call = async (name, body, headers = {}) => {
  const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9', ...headers }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json().catch(() => null) };
};
const agent = { authorization: 'Bearer agentTok' };
const sig = 'data:image/png;base64,' + png.toString('base64');

// Preflight rule checks
let r = await call('esignPreflight', { documentId: 'doc2', signers: [{ name: 'Bob', email: 'bob@x' }, { name: '', email: 'sue@x.com' }], skipAi: true }, agent);
assert.equal(r.status, 200);
assert.ok(r.body.issues.some((i) => i.severity === 'critical' && /email/.test(i.title)), 'bad email flagged');
assert.ok(r.body.issues.some((i) => /Nothing for sue/.test(i.title)), 'signer with no boxes flagged');
r = await call('esignPreflight', { documentId: 'doc2', signers: [{ name: 'Bob', email: 'bob@x.com' }], skipAi: true }, { authorization: 'Bearer otherTok' });
assert.equal(r.status, 403, 'other brokerage cannot preflight');

// Send with a code required and daily reminders
r = await call('createESignSubmission', { documentId: 'doc2', transactionId: 'tx1', signers: [{ name: 'Bob', email: 'bob@x.com' }], options: { verify: 'email', remindDays: 1 } }, agent);
assert.equal(r.status, 200, JSON.stringify(r.body));
const sub = globalThis.__db.esign_submission.at(-1);
assert.equal(sub.extra.verify, 'email'); assert.equal(sub.extra.remind_days, 1);
const token = tokenIn(emails.at(-1));

// Code gate
r = await call('getSubmissionByToken', { token });
assert.equal(r.body.needsCode, true); assert.ok(!r.body.document.fields, 'nothing but the title before the code');
assert.match(r.body.signer.email, /^b\*+@x\.com$/);
r = await call('submitSignature', { submissionToken: token, signedFields: [] });
assert.equal(r.status, 401, 'cannot sign without the code');
r = await call('esignCode', { token, action: 'send' });
assert.equal(r.status, 200);
const code = emails.at(-1).subject.match(/(\d{6})/)[1];
r = await call('esignCode', { token, action: 'check', code: code === '000000' ? '111111' : '000000' });
assert.equal(r.status, 400, 'wrong code');
r = await call('esignCode', { token, action: 'check', code });
assert.equal(r.status, 200); const proof = r.body.proof; assert.ok(proof);
r = await call('getSubmissionByToken', { token, proof: 'forged' });
assert.equal(r.body.needsCode, true, 'forged proof rejected');
r = await call('getSubmissionByToken', { token, proof });
assert.equal(r.status, 200); assert.equal(r.body.document.fields.length, 7);
assert.deepEqual(r.body.people, [{ name: 'Bob', signed: false, me: true }]);

// Attachment upload slot, inside the deal's folder
r = await call('esignAttach', { token, proof, name: 'proof of funds.pdf', size: 1000 });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.match(r.body.path, /^scoped\/B1\/tx\/tx1\/esign-/);
const attachUrl = r.body.file_url;
globalThis.__storage[`private-files/${r.body.path}`] = original;
r = await call('esignAttach', { token, name: 'x.pdf', size: 1000 });
assert.equal(r.status, 401, 'attach needs the code too');

// Nudge (rate limited) and settings
r = await call('esignManage', { action: 'nudge', submissionId: sub.id }, agent);
assert.equal(r.status, 200); assert.match(emails.at(-1).subject, /^Reminder/);
r = await call('esignManage', { action: 'nudge', submissionId: sub.id }, agent);
assert.equal(r.status, 429, 'one nudge an hour');
r = await call('esignManage', { action: 'settings', submissionId: sub.id, remindDays: 0 }, agent);
assert.equal(r.status, 200); assert.equal(globalThis.__db.esign_submission.at(-1).extra.remind_days, 0);

// Validation of the new types
const base = [{ field_id: 's', value: sig }, { field_id: 'dd', value: '30 days' }];
r = await call('submitSignature', { submissionToken: token, proof, signedFields: base });
assert.equal(r.status, 400, 'radio group needs a choice');
r = await call('submitSignature', { submissionToken: token, proof, signedFields: [...base, { field_id: 'r2', value: 'X' }] });
assert.equal(r.status, 400, 'lender required once "Loan" is picked');
r = await call('submitSignature', { submissionToken: token, proof, signedFields: [{ field_id: 's', value: sig }, { field_id: 'dd', value: '90 days' }, { field_id: 'r1', value: 'X' }] });
assert.equal(r.status, 400, 'dropdown value must be one of the options');
r = await call('submitSignature', { submissionToken: token, proof, signedFields: [...base, { field_id: 'r1', value: 'X' }, { field_id: 'pof', value: '/api/file?p=scoped%2FB2%2Ftx%2Fzz%2Fesign-a-b-x.pdf' }] });
assert.equal(r.status, 400, 'attachment must be from this request');

// In person: another brokerage can't; the agent can
r = await call('esignInPerson', { submissionId: sub.id, signerEmail: 'bob@x.com' }, { authorization: 'Bearer otherTok' });
assert.equal(r.status, 403);
r = await call('esignInPerson', { submissionId: sub.id, signerEmail: 'bob@x.com' }, agent);
assert.equal(r.status, 200); assert.match(r.body.url, /^\/sign\?token=.+&inperson=1#proof=/);
const ipProof = r.body.url.split('#proof=')[1];

r = await call('submitSignature', { submissionToken: token, proof: ipProof, signedFields: [...base, { field_id: 'r2', value: 'X' }, { field_id: 'lender', value: 'First Bank' }, { field_id: 'cb', value: 'X' }, { field_id: 'pof', value: attachUrl }] });
assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.completed, true);

const done = globalThis.__db.esign_submission.at(-1);
assert.equal(done.extra.sealed, true, 'sealed');
const pdf = globalThis.__storage['private-files/' + done.extra.signed_pdf_path.replace('private-files/', '')];
const out = new URL('./out-upgrade.pdf', import.meta.url);
fs.writeFileSync(out, pdf);
try {
  const info = execFileSync('pdfsig', [out.pathname]).toString();
  assert.match(info, /Signature is Valid/);
  const bad = Buffer.from(pdf); bad[200] = bad[200] ^ 1; fs.writeFileSync(out.pathname + '.bad.pdf', bad);
  let tampered = '';
  try { tampered = execFileSync('pdfsig', [out.pathname + '.bad.pdf']).toString(); } catch (e) { tampered = String(e.stdout); }
  assert.ok(!/Signature is Valid/.test(tampered), 'a changed file fails the seal');
} catch (e) { if (e.code !== 'ENOENT') throw e; console.log('(pdfsig not installed, seal check skipped)'); }
const text = execFileSync('pdftotext', [out.pathname, '-']).toString();
assert.match(text, /verify\?id=/); assert.match(text, /proof.of.funds/i);
assert.match(text, /in person/i, 'certificate says it was signed in person');

// Auto-filed on the deal and the matching checklist item; signer's file on the deal
const tx = globalThis.__db.transaction[0];
assert.ok(tx.documents.some((d) => d.url === attachUrl), 'signer file on the deal');
assert.equal(globalThis.__db.checklist[0].items[0].status, 'uploaded', 'matched checklist item by name');
assert.ok((globalThis.__db.notification || []).some((n) => /Fully signed/i.test(n.title || '')), 'sender told it is done');

// Public verify page
r = await call('esignVerify', { id: done.id });
assert.equal(r.status, 200); assert.equal(r.body.sealed, true); assert.equal(r.body.final_sha256, done.extra.final_sha256);
assert.match(r.body.signers[0].email, /\*/, 'emails masked');
const crypto = await import('node:crypto');
assert.equal(crypto.createHash('sha256').update(pdf).digest('hex'), done.extra.final_sha256, 'fingerprint matches the stored file');
r = await call('esignVerify', { id: 'nope' });
assert.equal(r.status, 404);

// Packet: template fields move to their place in the merged file
globalThis.__storage['private-files/scoped/B1/tx/tx1/a.pdf'] = original;
globalThis.__storage['private-files/scoped/B1/tx/tx1/b.png'] = png;
globalThis.__db.esign_template = [{ id: 't1', brokerage_id: 'B1', title: 'T', document_url: '/api/file?p=scoped%2FB1%2Ftx%2Ftx1%2Fa.pdf', fields: [{ id: 'q', type: 'signature', x: 5, y: 50, width: 20, hPct: 10, signer_index: 0 }], extra: {} }];
r = await call('esignPacket', { title: 'Packet', transactionId: 'tx1', parts: [{ url: '/api/file?p=scoped%2FB1%2Ftx%2Ftx1%2Fb.png' }, { templateId: 't1' }] }, agent);
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.fields.length, 1); assert.equal(r.body.fields[0].id, 'p2_q');
assert.ok(r.body.fields[0].y > 50 && r.body.fields[0].hPct < 10, 'field moved down and scaled');
r = await call('esignPacket', { parts: [{ url: 'https://evil.example/x.pdf' }] }, agent);
assert.equal(r.status, 400, 'outside links refused');
r = await call('esignPacket', { parts: [{ url: '/api/file?p=scoped%2FB1%2Ftx%2Ftx1%2Fa.pdf' }] }, { authorization: 'Bearer otherTok' });
assert.equal(r.status, 403, "can't pull another brokerage's file");

console.log('E-sign upgrades: all checks passed');
