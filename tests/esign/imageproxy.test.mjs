// Image proxy (for printing outside photos) and link previews: signed-in only, pictures only,
// and never a private or internal address, including through a redirect.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app' });
const fetched = [];
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
globalThis.fetch = async (url) => {
  url = String(url); fetched.push(url);
  if (url.startsWith('https://93.184.216.34/photo.jpg')) return new Response(PNG, { status: 200, headers: { 'content-type': 'image/jpeg' } });
  if (url.startsWith('https://93.184.216.34/page.html')) return new Response('<html><title>Hi</title><meta property="og:title" content="Nice house"></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (url.startsWith('https://93.184.216.34/sneaky')) return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } });
  if (url.startsWith('https://93.184.216.34/hop')) return new Response(null, { status: 301, headers: { location: '/photo.jpg' } });
  if (url.startsWith('https://93.184.216.34/notimg')) return new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
  if (url.startsWith('https://93.184.216.34/huge')) return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(50 * 1024 * 1024) } });
  throw new Error('should not fetch ' + url);
};
globalThis.__users = { ann: { id: 'u1', email: 'ann@x.com' } };
globalThis.__db = { profiles: [{ id: 'u1', email: 'ann@x.com', full_name: 'Ann', role: 'user', brokerage_id: 'B1', extra: {} }] };
const { GET, POST } = await import('./fn.mjs');
const img = (u, tok = 'ann') => GET(new Request(`https://gurubroker.app/api/fn/imageProxy?u=${encodeURIComponent(u)}`, { headers: tok ? { authorization: `Bearer ${tok}` } : {} }));

let r = await img('https://93.184.216.34/photo.jpg', null);
assert.equal(r.status, 401, 'signed-in only');
r = await img('https://93.184.216.34/photo.jpg');
assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'image/jpeg');
assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
r = await img('https://93.184.216.34/hop');
assert.equal(r.status, 200, 'public redirects are followed');
for (const bad of ['http://127.0.0.1/x.png', 'http://169.254.169.254/latest', 'http://10.0.0.5/a.jpg', 'http://[::1]/a.png', 'http://192.168.1.1/a.png', 'http://localhost/a.png', 'file:///etc/passwd', 'https://93.184.216.34:8443/a.png', 'http://[::ffff:127.0.0.1]/a.png']) {
  const before = fetched.length;
  r = await img(bad);
  assert.equal(r.status, 400, `blocked: ${bad}`);
  assert.equal(fetched.length, before, `never fetched: ${bad}`);
}
r = await img('https://93.184.216.34/sneaky');
assert.equal(r.status, 400, 'redirect to a private address is blocked');
assert.ok(!fetched.some((u) => u.includes('169.254')), 'the private address was never fetched');
r = await img('https://93.184.216.34/notimg');
assert.equal(r.status, 415, 'pictures only');
r = await img('https://93.184.216.34/huge');
assert.equal(r.status, 413, 'size cap');

// Link previews: signed in, and the same address checks.
const prev = (url, tok = 'ann') => POST(new Request('https://gurubroker.app/api/fn/fetchLinkMetadata', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify({ url }) })).then(async (x) => ({ status: x.status, body: await x.json() }));
let p = await prev('https://93.184.216.34/page.html', null);
assert.equal(p.status, 401);
p = await prev('https://93.184.216.34/page.html');
assert.equal(p.body.title, 'Nice house');
const n = fetched.length;
p = await prev('http://169.254.169.254/latest/meta-data');
assert.equal(p.status, 400); assert.equal(fetched.length, n);
console.log('imageproxy: all passed');
