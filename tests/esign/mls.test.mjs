// RETS client + MLS sync against a local fake RETS server (Digest auth, COMPACT-DECODED).
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
const md5 = (s) => createHash('md5').update(s).digest('hex');

// 1,203 fake listings with increasing modification times
const LIST = Array.from({ length: 1203 }, (_, i) => ({
  ListingKey: String(1000 + i), ListingId: `N${10000 + i}`, StandardStatus: i % 3 ? 'Active' : 'Closed',
  ListPrice: String(300000 + i * 100), ClosePrice: i % 3 ? '' : String(310000 + i * 100),
  StreetNumber: String(i + 1), StreetName: 'Elm', StreetSuffix: 'St', City: 'Hartford', StateOrProvince: 'CT', PostalCode: '06103',
  BedroomsTotal: '3', BathroomsTotalInteger: '2', LivingArea: '1,650', ModificationTimestamp: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString().replace('.000Z', ''),
  PublicRemarks: 'Nice & bright <home>',
}));
const COLS = Object.keys(LIST[0]);
let logins = 0; let searches = 0;
const server = http.createServer((req, res) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Digest ')) {
    res.writeHead(401, { 'WWW-Authenticate': 'Digest realm="rets@test", qop="auth", nonce="abc123", opaque="op1"' });
    return res.end();
  }
  const p = Object.fromEntries([...auth.matchAll(/(\w+)="?([^",]+)"?/g)].map((m) => [m[1], m[2]]));
  const ha1 = md5(`user:rets@test:pass`); const ha2 = md5(`GET:${p.uri}`);
  const expected = md5(`${ha1}:${p.nonce}:${p.nc}:${p.cnonce}:${p.qop}:${ha2}`);
  if (p.response !== expected || p.uri !== req.url) { res.writeHead(401, { 'WWW-Authenticate': 'Digest realm="rets@test", qop="auth", nonce="abc123"' }); return res.end('bad digest'); }
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/login') {
    logins++;
    res.writeHead(200, { 'Set-Cookie': 'RETS-Session-ID=sess42; path=/' });
    return res.end(`<RETS ReplyCode="0" ReplyText="Success"><RETS-RESPONSE>\nSearch=/search\nLogout=/logout\n</RETS-RESPONSE></RETS>`);
  }
  if (u.pathname === '/logout') return res.end('<RETS ReplyCode="0" ReplyText="bye"/>');
  if (u.pathname === '/search') {
    searches++;
    assert.match(req.headers.cookie || '', /RETS-Session-ID=sess42/);
    const since = u.searchParams.get('Query').match(/=(.+)\+\)/)[1];
    const hits = LIST.filter((l) => l.ModificationTimestamp >= since);
    const off = Number(u.searchParams.get('Offset')); const lim = Number(u.searchParams.get('Limit'));
    const page = hits.slice(off - 1, off - 1 + lim);
    if (!hits.length) return res.end('<RETS ReplyCode="20201" ReplyText="No Records Found"/>');
    const esc = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return res.end(`<RETS ReplyCode="0" ReplyText="Success"><COUNT Records="${hits.length}"/><DELIMITER value="09"/>
<COLUMNS>\t${COLS.join('\t')}\t</COLUMNS>
${page.map((l) => `<DATA>\t${COLS.map((c) => esc(l[c])).join('\t')}\t</DATA>`).join('\n')}
</RETS>`);
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

Object.assign(process.env, {
  SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app',
  MLS_SOURCES: 'smartmls', SMARTMLS_TYPE: 'rets', SMARTMLS_FEED: 'vow', SMARTMLS_LOGIN_URL: `http://127.0.0.1:${port}/login`,
  SMARTMLS_USERNAME: 'user', SMARTMLS_PASSWORD: 'pass', SMARTMLS_BATCH: '500',
});
globalThis.__db = {};
const { POST } = await import('./fn.mjs');
const call = (name) => POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'x-gbh-service': 'hs' }, body: '{}' }));

let r = await call('mlsSync');
let body = await r.json();
assert.equal(r.status, 200, JSON.stringify(body));
assert.equal(globalThis.__db.mls_listing.length, 1203, 'full backfill in one run: ' + JSON.stringify(body));
const l = globalThis.__db.mls_listing.find((x) => x.mls_number === 'N10000');
assert.equal(l.street_address, '1 Elm St');
assert.equal(l.living_area, 1650);
assert.equal(l.status, 'Closed');
assert.equal(l.close_price, 310000);
assert.equal(l.public_remarks, 'Nice & bright <home>');
assert.equal(l.feed_type, 'vow');
const st = globalThis.__db.mls_sync_state[0];
assert.equal(st.cursor, '2026-01-01T20:02:00.000Z'); assert.equal(st.page_offset, 1); assert.equal(st.last_error, null);

// Only changes after the cursor on the next run
LIST.push({ ...LIST[5], ListPrice: '999999', ModificationTimestamp: '2026-02-01T00:00:00' });
r = await call('mlsSync'); body = await r.json();
assert.ok(body.report.smartmls.pulled <= 2, JSON.stringify(body));
assert.equal(globalThis.__db.mls_listing.find((x) => x.listing_key === '1005').list_price, 999999);
assert.equal(globalThis.__db.mls_listing.length, 1203, 'updates in place');

// Blocked without the scheduler secret
r = await POST(new Request('https://gurubroker.app/api/fn/mlsSync', { method: 'POST', body: '{}' }));
assert.equal(r.status, 403);

server.close();
console.log(`MLS sync: all checks passed (${logins} logins, ${searches} searches)`);
