// Marketing: AI copy with fair-housing instructions, tweaks, MLS photo copy, AI background.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', ANTHROPIC_API_KEY: 'sk-ant', OPENAI_API_KEY: 'sk-oai', AI_PROVIDER: 'anthropic' });
const calls = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
globalThis.fetch = async (url, init) => {
  url = String(url);
  const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  calls.push({ url, body });
  if (url.includes('anthropic')) {
    const prev = JSON.stringify(body.messages).includes('current design content');
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input: {
      template: prev ? 'minimal' : 'nonsense', palette: { primary: '#123456', accent: '#c9a227', background: '#fff', text: '#111' }, ribbon: 'JUST LISTED',
      headline: prev ? 'Shorter headline' : 'Welcome to 12 Elm', body: 'Bright and updated.', bullets: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], cta: 'Book a tour',
      social_caption: 'New!', hashtags: ['#realestate', 'justlisted'], email_subject: 'Just listed' } }] }));
  }
  if (url.includes('api.openai.com/v1/images')) return new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
  if (url.startsWith('https://photos.mls/')) return new Response(png, { headers: { 'content-type': url.endsWith('bad') ? 'text/html' : 'image/png' } });
  throw new Error('unexpected ' + url);
};
globalThis.__users = { tok: { id: 'u1', email: 'ann@x.com' } };
globalThis.__db = {
  profiles: [{ id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', extra: {} }],
  mls_listing: [{ id: 'smartmls:1', photos: ['https://photos.mls/1.jpg', 'https://photos.mls/bad', 'https://photos.mls/2.jpg'] }],
};
const { POST } = await import('./fn.mjs');
const call = async (name, body) => { const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tok' }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };

let r = await call('marketingAI', { kind: 'just_listed', prompt: 'luxury, mention kitchen', listing: { street_address: '12 Elm St', city: 'Hartford', state: 'CT', price: 450000, beds: 3, baths_total: 2 } });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.content.template, 'hero', 'unknown template falls back');
assert.equal(r.body.content.bullets.length, 5); assert.deepEqual(r.body.content.hashtags, ['realestate', 'justlisted']);
const req = calls.find((c) => c.url.includes('anthropic')).body;
assert.match(req.system, /Fair Housing/); assert.match(JSON.stringify(req.messages), /\$450,000/); assert.match(JSON.stringify(req.messages), /Ann Agent/);
r = await call('marketingAI', { previous: r.body.content, instruction: 'shorter and more modern' });
assert.equal(r.body.content.headline, 'Shorter headline'); assert.equal(r.body.content.template, 'minimal');

r = await call('marketingAssets', { listing_id: 'smartmls:1' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.photos.length, 2, 'non-images skipped');
r = await call('marketingAssets', { listing_id: 'nope' });
assert.equal(r.status, 404);

r = await call('marketingImage', { prompt: 'coastal living room at sunset', shape: 'landscape' });
assert.equal(r.status, 200, JSON.stringify(r.body));
const img = calls.find((c) => c.url.includes('/v1/images')).body;
assert.equal(img.size, '1536x1024'); assert.match(img.prompt, /No text/);
assert.match(r.body.url, /^http/);
console.log('Marketing: all checks passed');
