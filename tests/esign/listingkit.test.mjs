// Listing kits: made once when a listing deal goes under contract or any deal closes, from the
// agent's own new MLS listings, or on request; uses MLS facts and photos; buyer-side wording.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', ANTHROPIC_API_KEY: 'sk-ant', AI_PROVIDER: 'anthropic', RESEND_API_KEY: 're' });
const prompts = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('resend')) return new Response('{"id":"e"}');
  if (url.includes('anthropic')) {
    const body = JSON.parse(init.body); prompts.push(JSON.stringify(body));
    return Response.json({ content: [{ type: 'tool_use', name: 'respond', input: { template: 'hero', palette: { primary: '#111111', accent: '#65a30d', background: '#ffffff', text: '#111111' }, ribbon: 'JUST SOLD', headline: 'Sold on Goose Hill', body: 'Another happy close.', bullets: ['3 beds'], cta: 'Call me', social_caption: 'Sold!', hashtags: ['#sold'], email_subject: 'Sold' } }] });
  }
  throw new Error('unexpected ' + url);
};
globalThis.__users = { ann: { id: 'u1', email: 'ann@x.com' } };
globalThis.__db = {
  profiles: [{ id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', extra: { brand_color: '#123456' } }],
  mls_listing: [
    { id: 'smart:1', mls_number: '170001', status: 'Closed', street_address: '43 Goose Hill Rd', city: 'Chester', state: 'CT', zip: '06412', beds: 3, baths_total: 2, living_area: 1800, photos: ['https://img/1.jpg', { url: 'https://img/2.jpg' }], public_remarks: 'Lovely colonial.' },
    { id: 'smart:2', mls_number: '170002', status: 'Active', list_date: new Date().toISOString().slice(0, 10), street_address: '9 New Ln', city: 'Essex', state: 'CT', zip: '06426', list_agent_email: 'Ann@X.com', photos: [] },
    { id: 'smart:3', mls_number: '170003', status: 'Active', list_date: new Date().toISOString().slice(0, 10), street_address: '1 Other St', city: 'Essex', state: 'CT', zip: '06426', list_agent_email: 'someone@else.com', photos: [] },
  ],
  marketing_design: [], notification: [], brokerage_settings: [], push_subscription: [],
  transaction: [{ id: 't1', brokerage_id: 'B1', agent_email: 'ann@x.com', property_address: '43 Goose Hill Rd, Chester, CT 06412', status: 'active', deal_type: 'buyer', sale_price: 470000, extra: {} }],
};
const { POST } = await import('./fn.mjs');
const svc = (body) => POST(new Request('https://gurubroker.app/api/fn/listingKit', { method: 'POST', headers: { 'x-gbh-service': 'hs' }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const user = (body) => POST(new Request('https://gurubroker.app/api/fn/listingKit', { method: 'POST', headers: { authorization: 'Bearer ann' }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const tx = { id: 't1', brokerage_id: 'B1', agent_email: 'ann@x.com', property_address: '43 Goose Hill Rd, Chester, CT 06412', status: 'closed', deal_type: 'buyer', sale_price: 470000 };

let r = await POST(new Request('https://gurubroker.app/api/fn/listingKit', { method: 'POST', body: JSON.stringify({ event: { type: 'update', data: tx, old_data: { ...tx, status: 'active' } } }) }));
assert.equal(r.status, 403, 'automation only from the database');
r = await svc({ event: { type: 'update', data: { ...tx, status: 'active' }, old_data: tx } });
assert.equal(r.body.skipped, 'no kit moment');
r = await svc({ event: { type: 'create', data: { ...tx, status: 'active' } } });
assert.equal(r.body.skipped, 'no kit moment', 'buyer-side new deal: no under-contract mailer');
r = await svc({ event: { type: 'update', data: tx, old_data: { ...tx, status: 'active' } } });
assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.designs.length, 4);
const kit = __db.marketing_design.map((d) => ({ ...d, ...(d.extra || {}) }));
assert.deepEqual(kit.map((d) => d.format), ['postcard_4x6', 'flyer', 'post', 'story']);
assert.equal(kit[0].kind, 'just_sold'); assert.equal(kit[0].owner_email, 'ann@x.com'); assert.equal(kit[0].transaction_id, 't1');
assert.equal(kit[0].data.listing.beds, 3, 'MLS facts'); assert.deepEqual(kit[0].data.photos, ['https://img/1.jpg', 'https://img/2.jpg']);
assert.equal(kit[0].data.listing.price, 470000);
assert.ok(prompts[0].includes('represented the buyers'), 'buyer-side wording'); assert.ok(prompts[0].includes('#123456'), 'brand color');
assert.ok(__db.notification.some((n) => n.user_email === 'ann@x.com' && /kit is ready/.test(n.title)));
r = await svc({ event: { type: 'update', data: tx, old_data: { ...tx, status: 'active' } } });
assert.equal(r.body.skipped, 'already made'); assert.equal(__db.marketing_design.length, 4);
// Imported history never makes kits.
r = await svc({ event: { type: 'update', data: { ...tx, id: 't9', imported: true }, old_data: { ...tx, status: 'active' } } });
assert.equal(r.body.skipped, 'n/a');
// Listing side, new deal: under contract.
r = await svc({ event: { type: 'create', data: { ...tx, id: 't2', status: 'active', deal_type: 'listing' } } });
assert.equal(r.body.designs.length, 4);
// Hourly MLS scan: only the agent's own new listing.
r = await svc({ scan: true });
assert.equal(r.body.made, 1);
assert.ok(__db.marketing_design.some((d) => (d.extra || {}).kit_key === 'just_listed:mls:smart:2'));
r = await svc({ scan: true });
assert.equal(r.body.made, 0, 'once per listing');
// On request
r = await user({ action: 'make', kind: 'open_house', mls_id: 'smart:1' });
assert.equal(r.status, 200); assert.equal(r.body.designs.length, 4);
console.log('listing kits: all checks passed');
