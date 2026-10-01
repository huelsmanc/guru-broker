// Private files: uploads go to the record's folder; opening a file checks the person can see
// that record; the AI and e-sign get short-lived links only for files the caller may open;
// existing public deal files can be moved to private.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', ANTHROPIC_API_KEY: 'sk-ant', AI_PROVIDER: 'anthropic' });
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init });
  if (url.includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input: { document_type: 'PSA', summary: 'ok', buyers: [], sellers: [], dates: {}, contingencies: [], issues: [] } }] }));
  throw new Error('unexpected ' + url);
};
globalThis.__users = { ann: { id: 'u1', email: 'ann@x.com' }, bob: { id: 'u2', email: 'bob@x.com' }, boss: { id: 'u3', email: 'boss@x.com' }, eve: { id: 'u9', email: 'eve@other.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u2', email: 'bob@x.com', full_name: 'Bob', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u3', email: 'boss@x.com', full_name: 'Boss', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'eve@other.com', full_name: 'Eve', role: 'owner', brokerage_id: 'B2', extra: {} },
  ],
  transaction: [{ id: 't1', brokerage_id: 'B1', agent_email: 'ann@x.com', property_address: '12 Elm St', documents: [{ name: 'Old.pdf', url: 'http://sb/storage/v1/object/public/public-files/170-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-Old.pdf' }], extra: {} }],
  checklist: [{ id: 'cl1', brokerage_id: 'B1', subject_type: 'transaction', subject_id: 't1', subject_email: 'ann@x.com', items: [{ id: 'i1', title: 'PSA', requires_document: true, status: 'open' }], extra: {} }],
  direct_message: [{ id: 'd1', brokerage_id: 'B1', sender_email: 'ann@x.com', receiver_email: 'bob@x.com', content: '[file]http://sb/storage/v1/object/public/public-files/pic.png|image/png|pic.png', extra: {} }],
};
globalThis.__storage ||= {};
globalThis.__storage['public-files/170-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-Old.pdf'] = new Uint8Array([37, 80, 68, 70]);
globalThis.__storage['public-files/pic.png'] = new Uint8Array([137, 80, 78, 71]);
// Security rules (as in the real database): deals are visible to their agent and to owners/admins.
globalThis.__rls = {
  transaction: (row, u) => row.agent_email === u.email || ['boss@x.com'].includes(u.email),
};
const { POST } = await import('./fn.mjs');
const { GET } = await import('./file.mjs');
const as = (tok) => async (name, body = {}) => { const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };
const open = (path, { tok, html } = {}) => GET(new Request(`https://gurubroker.app/api/file?p=${encodeURIComponent(path)}`, { headers: { ...(tok ? { cookie: `theme=dark; gbh_at=${tok}` } : {}), ...(html ? { accept: 'text/html' } : {}) } }));

// Uploading: only into folders you can see.
let r = await as('ann')('fileUpload', { scope: { kind: 'tx', id: 't1' }, name: 'Purchase & Sale.pdf', size: 1000 });
assert.equal(r.status, 200, JSON.stringify(r.body));
const path = r.body.path;
assert.match(path, /^scoped\/B1\/tx\/t1\/[a-z0-9]+-[a-z0-9]+-Purchase_Sale\.pdf$/);
assert.equal(r.body.file_url, `/api/file?p=${encodeURIComponent(path)}`);
assert.ok(r.body.token && r.body.signedUrl);
r = await as('bob')('fileUpload', { scope: { kind: 'tx', id: 't1' }, name: 'x.pdf' });
assert.equal(r.status, 403, "Bob isn't on the deal");
r = await as('ann')('fileUpload', { scope: { kind: 'tx', id: '../../etc' }, name: 'x.pdf' });
assert.equal(r.status, 400);
r = await as('ann')('fileUpload', { scope: { kind: 'tx', id: 't1' }, name: 'big.pdf', size: 60 * 1024 * 1024 });
assert.equal(r.status, 400, 'size limit');
globalThis.__storage[`private-files/${path}`] = new Uint8Array([37, 80, 68, 70, 45]);

// Opening.
let res = await open(path, { tok: 'ann' });
assert.equal(res.status, 302); assert.match(res.headers.get('location'), /^https:\/\/storage\.test\/private-files\/scoped\/B1\/tx\/t1\//);
res = await open(path, { tok: 'boss' });
assert.equal(res.status, 302, 'owner can open deal files');
res = await open(path, { tok: 'bob' });
assert.equal(res.status, 403, "Bob can't open it even with the link");
res = await open(path, { tok: 'bob', html: true });
assert.equal(res.status, 403); assert.match(await res.text(), /don't have access/);
res = await open(path, { tok: 'eve' });
assert.equal(res.status, 403, 'other brokerage');
res = await open(path);
assert.equal(res.status, 401, 'not signed in');
res = await open(path, { html: true });
assert.equal(res.status, 302); assert.match(res.headers.get('location'), /^\/login\?next=%2Fapi%2Ffile%3Fp%3D/);
res = await open('scoped/B1/tx/t1/../../secret.pdf', { tok: 'boss' });
assert.equal(res.status, 404);
res = await GET(new Request(`https://gurubroker.app/api/file?download=1&p=${encodeURIComponent(path)}`, { headers: { authorization: 'Bearer ann' } }));
assert.match(res.headers.get('location'), /download=1/);

// Direct-message files: only the two people.
r = await as('ann')('fileUpload', { scope: { kind: 'dm', emails: ['ann@x.com', 'bob@x.com'] }, name: 'note.png' });
const dmPath = r.body.path; globalThis.__storage[`private-files/${dmPath}`] = new Uint8Array([1]);
assert.equal((await open(dmPath, { tok: 'bob' })).status, 302);
assert.equal((await open(dmPath, { tok: 'boss' })).status, 403, 'admins do not open other people\'s DMs');
r = await as('boss')('fileUpload', { scope: { kind: 'dm', emails: ['ann@x.com', 'bob@x.com'] }, name: 'x.png' });
assert.equal(r.status, 403);

// Onboarding: the person and admins.
r = await as('boss')('fileUpload', { scope: { kind: 'user', id: 'u1' }, name: 'w9.pdf' });
const onbPath = r.body.path; globalThis.__storage[`private-files/${onbPath}`] = new Uint8Array([1]);
assert.equal((await open(onbPath, { tok: 'ann' })).status, 302);
assert.equal((await open(onbPath, { tok: 'bob' })).status, 403);

// Checklist attach: can't attach someone else's private file.
const url = `/api/file?p=${encodeURIComponent(path)}`;
r = await as('ann')('checklistAction', { action: 'attach', checklist_id: 'cl1', item_id: 'i1', url, name: 'PSA.pdf' });
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await as('ann')('checklistAction', { action: 'attach', checklist_id: 'cl1', item_id: 'i1', url: `/api/file?p=${encodeURIComponent(dmPath.replace('ann', 'x'))}`, name: 'x' });
assert.equal(r.status, 200, 'own DM file is fine');

// AI scan: private links become short-lived links, only for files the caller can open.
r = await as('ann')('aiScanDocument', { file_urls: [url] });
assert.equal(r.status, 200, JSON.stringify(r.body));
const sent = JSON.parse(calls.filter((c) => c.url.includes('anthropic')).at(-1).init.body);
assert.match(JSON.stringify(sent.messages), /storage\.test\/private-files\/scoped\/B1\/tx\/t1/);
r = await as('bob')('aiScanDocument', { file_urls: [url] });
assert.equal(r.status, 403);
r = await as('ann')('aiScanDocument', { file_urls: ['http://169.254.169.254/latest'] });
assert.equal(r.status, 400, 'only https links or our own files');

// Moving existing public deal files to private.
r = await as('ann')('secureFiles', { table: 'transaction' });
assert.equal(r.status, 403, 'owner or broker only');
let step = { table: 'transaction', cursor: '' }; let moved = 0;
while (step) { r = await as('boss')('secureFiles', step); assert.equal(r.status, 200, JSON.stringify(r.body)); moved += r.body.moved; step = r.body.next; }
assert.equal(moved, 2);
const docUrl = globalThis.__db.transaction[0].documents[0].url;
assert.match(docUrl, /^\/api\/file\?p=scoped%2FB1%2Ftx%2Ft1%2F/);
assert.match(decodeURIComponent(docUrl), /-Old\.pdf$/, 'keeps the file name');
assert.match(globalThis.__db.direct_message[0].content, /^\[file\]\/api\/file\?p=scoped%2FB1%2Fdm%2F/);
assert.match(globalThis.__db.direct_message[0].content, /\|image\/png\|pic\.png$/);
const newPath = decodeURIComponent(docUrl.split('p=')[1]);
assert.deepEqual([...globalThis.__storage[`private-files/${newPath}`]], [37, 80, 68, 70]);

console.log('Private files: all checks passed');
