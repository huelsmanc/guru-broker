// Company library: uploads into a folder are for library managers; a file opens for whoever can see
// its folder (private folders: admins and chosen people), wherever it was first stored; deleting
// removes the entry, its form setup and the stored file unless something else still uses it;
// duplicating copies the file and its form setup.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app' });
globalThis.fetch = async (url) => { throw new Error('unexpected ' + url); };
globalThis.__users = { boss: { id: 'u0', email: 'boss@x.com' }, ann: { id: 'u1', email: 'ann@x.com' }, bob: { id: 'u2', email: 'bob@x.com' }, tom: { id: 'u3', email: 'tom@x.com' }, eve: { id: 'u9', email: 'eve@y.com' } };
const P = (p) => `/api/file?p=${encodeURIComponent(p)}`;
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'boss@x.com', full_name: 'Boss', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u2', email: 'bob@x.com', full_name: 'Bob', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u3', email: 'tom@x.com', full_name: 'Tom', role: 'agent', brokerage_id: 'B1', permissions: { 'library.manage': true }, extra: {} },
    { id: 'u9', email: 'eve@y.com', full_name: 'Eve', role: 'owner', brokerage_id: 'B2', extra: {} },
  ],
  library_folder: [
    { id: 'fpub', brokerage_id: 'B1', name: 'Forms', private: false, extra: {} },
    { id: 'fpriv', brokerage_id: 'B1', name: 'Broker only', private: true, member_emails: ['bob@x.com'], extra: {} },
  ],
  file_repository: [
    { id: 'old', brokerage_id: 'B1', folder_id: 'fpriv', file_name: 'Payroll.pdf', file_url: P('scoped/B1/misc/1-a-Payroll.pdf'), extra: {} },
    { id: 'psa', brokerage_id: 'B1', folder_id: 'fpub', file_name: 'Purchase.pdf', file_url: P('scoped/B1/library/fpub/2-b-Purchase.pdf'), extra: { esign_template_id: 't1' } },
    { id: 'shared', brokerage_id: 'B1', folder_id: 'fpub', file_name: 'Shared.pdf', file_url: P('scoped/B1/library/fpub/3-c-Shared.pdf'), extra: {} },
  ],
  esign_template: [
    { id: 't1', brokerage_id: 'B1', title: 'Purchase', document_url: P('scoped/B1/library/fpub/2-b-Purchase.pdf'), fields: [{ id: 'f', type: 'signature' }], extra: { roles: ['Buyer 1'], source_file_id: 'psa', role_order: true } },
  ],
  checklist_template: [{ id: 'ct1', brokerage_id: 'B1', name: 'Listing', items: [{ id: 'i', title: 'Shared form', form_url: P('scoped/B1/library/fpub/3-c-Shared.pdf') }], extra: {} }],
};
globalThis.__storage ||= {};
for (const p of ['scoped/B1/misc/1-a-Payroll.pdf', 'scoped/B1/library/fpub/2-b-Purchase.pdf', 'scoped/B1/library/fpub/3-c-Shared.pdf']) globalThis.__storage[`private-files/${p}`] = new Uint8Array([37, 80, 68, 70]);
// The database's security rules, as in 0021.
const prof = (u) => __db.profiles.find((p) => p.email === u.email);
const admin = (u) => ['owner', 'broker', 'office_admin'].includes(prof(u)?.role);
const folderOk = (f, u) => f.brokerage_id === prof(u)?.brokerage_id && (!f.private || admin(u) || (f.member_emails || []).includes(u.email));
globalThis.__rls = {
  library_folder: folderOk,
  file_repository: (r, u) => r.brokerage_id === prof(u)?.brokerage_id && (!r.folder_id || __db.library_folder.some((f) => f.id === r.folder_id && folderOk(f, u))),
  esign_template: (r, u) => r.brokerage_id === prof(u)?.brokerage_id,
};
const { POST } = await import('./fn.mjs');
const { GET } = await import('./file.mjs');
const as = (tok) => async (name, body = {}) => { const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };
const open = (url, tok) => GET(new Request(`https://gurubroker.app${url}`, { headers: { cookie: `gbh_at=${tok}` } })).then((r) => r.status);

// Uploading into a library folder: managers only.
let r = await as('ann')('fileUpload', { scope: { kind: 'library', id: 'fpub' }, name: 'Mine.pdf', size: 10 });
assert.equal(r.status, 403, 'agents cannot add to the library');
r = await as('tom')('fileUpload', { scope: { kind: 'library', id: 'fpub' }, name: 'New form.pdf', size: 10 });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.match(r.body.path, /^scoped\/B1\/library\/fpub\/.+New_form\.pdf$/);

// Opening: follows the file's folder now, even for files first stored in the shared "misc" folder.
assert.ok(await open(__db.file_repository[1].file_url, 'ann') < 400, 'shared folder file opens');
assert.equal(await open(__db.file_repository[0].file_url, 'ann'), 403, 'private folder file stays private');
assert.ok(await open(__db.file_repository[0].file_url, 'bob') < 400, 'chosen person opens it');
assert.ok(await open(__db.file_repository[0].file_url, 'boss') < 400, 'admin opens it');
assert.equal(await open(__db.file_repository[1].file_url, 'eve'), 403, 'other brokerage cannot');

// Duplicate: a new file and its form setup (roles and order too).
assert.equal((await as('ann')('library', { action: 'duplicate', id: 'psa' })).status, 403);
r = await as('tom')('library', { action: 'duplicate', id: 'psa' });
assert.equal(r.status, 200, JSON.stringify(r.body));
const copy = __db.file_repository.find((f) => f.id === r.body.file.id);
assert.equal(copy.file_name, 'Copy of Purchase.pdf'); assert.equal(copy.folder_id, 'fpub');
assert.notEqual(copy.file_url, __db.file_repository[1].file_url);
assert.ok(Object.keys(__storage).some((k) => k.includes('library/fpub') && k.endsWith('Purchase.pdf') && !k.includes('2-b-')), 'bytes copied');
const t2 = __db.esign_template.find((t) => t.document_url === copy.file_url);
assert.ok(t2 && t2.fields.length === 1 && t2.extra.roles[0] === 'Buyer 1' && t2.extra.role_order === true, 'form setup copied');
assert.equal(copy.extra.esign_template_id, t2.id);

// Tom (manager, not admin) can't see or remove the private folder's file.
assert.equal((await as('tom')('library', { action: 'delete_file', id: 'old' })).status, 404);

// Delete: entry, its form setup and stored file go; a file a checklist still uses stays stored.
r = await as('boss')('library', { action: 'delete_file', id: 'psa' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.ok(!__db.file_repository.some((f) => f.id === 'psa'));
assert.ok(!__db.esign_template.some((t) => t.id === 't1'), 'form setup removed');
assert.ok(!('private-files/scoped/B1/library/fpub/2-b-Purchase.pdf' in __storage), 'stored file removed');
await as('boss')('library', { action: 'delete_file', id: 'shared' });
assert.ok('private-files/scoped/B1/library/fpub/3-c-Shared.pdf' in __storage, 'checklist form kept');

// Delete a folder: everything in it.
r = await as('boss')('library', { action: 'delete_folder', id: 'fpub' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.ok(!__db.library_folder.some((f) => f.id === 'fpub'));
assert.ok(!__db.file_repository.some((f) => f.folder_id === 'fpub'), 'files went with it');
assert.equal((await as('eve')('library', { action: 'delete_folder', id: 'fpriv' })).status, 404, 'other brokerage');
assert.ok(__db.library_folder.some((f) => f.id === 'fpriv'));

console.log('library: all checks passed');
