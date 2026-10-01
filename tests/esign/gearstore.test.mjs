// Gear store: brokers connect their own Shopify store; agents browse it and get a Shopify checkout link.
// The access token never leaves the server, and each brokerage only sees its own store.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app' });
const calls = [];
const product = { id: 'gid://shopify/Product/1', handle: 'hat', title: 'Logo Hat', description: 'Nice hat', vendor: 'Acme', productType: 'Hats', availableForSale: true,
  featuredImage: { url: 'https://cdn/hat.jpg' }, images: { nodes: [{ url: 'https://cdn/hat.jpg' }] },
  priceRange: { minVariantPrice: { amount: '25.0', currencyCode: 'USD' }, maxVariantPrice: { amount: '30.0', currencyCode: 'USD' } },
  options: [{ name: 'Size', optionValues: [{ name: 'S' }, { name: 'L' }] }],
  variants: { nodes: [{ id: 'gid://shopify/ProductVariant/11', title: 'S', availableForSale: true, price: { amount: '25.0', currencyCode: 'USD' }, compareAtPrice: null, selectedOptions: [{ name: 'Size', value: 'S' }], image: null }] } };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (!url.startsWith('https://')) throw new Error('unexpected ' + url);
  const body = JSON.parse(init.body || '{}'); calls.push({ url, token: init.headers?.['x-shopify-storefront-access-token'], body });
  if (url.includes('nope.myshopify.com')) return new Response('', { status: 401 });
  if (body.query.includes('shop { name }')) return Response.json({ data: { shop: { name: 'Acme Gear' } } });
  if (body.query.includes('collections(first')) return Response.json({ data: { collections: { nodes: [{ handle: 'hats', title: 'Hats', products: { nodes: [{ id: 'x' }] } }, { handle: 'empty', title: 'Empty', products: { nodes: [] } }] } } });
  if (body.query.includes('collection(handle')) return Response.json({ data: { collection: { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [product] } } } });
  if (body.query.includes('products(first')) return Response.json({ data: { products: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [product] } } });
  if (body.query.includes('cartCreate')) return Response.json({ data: { cartCreate: { cart: { id: 'cart1', checkoutUrl: 'https://acme.myshopify.com/cart/c/abc' }, userErrors: [] } } });
  throw new Error('unexpected query');
};
globalThis.__users = { boss: { id: 'u3', email: 'boss@x.com' }, ann: { id: 'u1', email: 'ann@x.com' }, eve: { id: 'u9', email: 'eve@o.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u3', email: 'boss@x.com', full_name: 'Boss', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'eve@o.com', full_name: 'Eve', role: 'owner', brokerage_id: 'B2', extra: {} },
  ],
  app_secret: [],
};
const { POST } = await import('./fn.mjs');
const call = (tok, body) => POST(new Request('https://gurubroker.app/api/fn/gearStore', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const TOKEN = 'abcdef0123456789abcdef0123456789';

let r = await call('ann', { action: 'status' });
assert.deepEqual(r.body, { connected: false, can_manage: false });
r = await call('ann', { action: 'connect', domain: 'acme', token: TOKEN });
assert.equal(r.status, 403, 'agents cannot connect');
r = await call('boss', { action: 'connect', domain: 'nope', token: TOKEN });
assert.equal(r.status, 502); assert.match(r.body.error, /access token/);
r = await call('boss', { action: 'connect', domain: 'acme', token: 'short' });
assert.equal(r.status, 400);
r = await call('boss', { action: 'connect', domain: 'https://ACME.myshopify.com/admin/products', token: TOKEN });
assert.equal(r.status, 200); assert.deepEqual(r.body, { connected: true, shop_name: 'Acme Gear', can_manage: true });
assert.equal(calls.at(-1).url, 'https://acme.myshopify.com/api/2026-07/graphql.json'); assert.equal(calls.at(-1).token, TOKEN);
assert.equal(__db.app_secret.length, 1); assert.equal(__db.app_secret[0].name, 'shopify:B1');

r = await call('ann', { action: 'status' });
assert.deepEqual(r.body, { connected: true, shop_name: 'Acme Gear', can_manage: false });
assert.ok(!JSON.stringify(r.body).includes(TOKEN), 'token never sent to the browser');
r = await call('eve', { action: 'status' });
assert.equal(r.body.connected, false, 'other brokerages do not see it');
r = await call('eve', { action: 'catalog' });
assert.equal(r.status, 404);

r = await call('ann', { action: 'catalog' });
assert.equal(r.status, 200);
assert.deepEqual(r.body.collections, [{ handle: 'hats', title: 'Hats' }], 'empty collections hidden');
assert.equal(r.body.products[0].title, 'Logo Hat'); assert.equal(r.body.products[0].price_min.amount, 25);
assert.deepEqual(r.body.products[0].options, [{ name: 'Size', values: ['S', 'L'] }]);
assert.deepEqual(r.body.page, { more: true, after: 'c1' });
assert.ok(!JSON.stringify(r.body).includes(TOKEN));
r = await call('ann', { action: 'catalog', collection: 'hats', after: 'c1' });
assert.equal(r.body.collections, undefined, 'collections only on the first page');
assert.equal(calls.at(-1).body.variables.h, 'hats');
r = await call('ann', { action: 'catalog', query: 'hat "x"' });
assert.equal(calls.filter((c) => c.body.query.includes('products(first: $first')).at(-1).body.variables.q, 'hat  x');

r = await call('ann', { action: 'checkout', lines: [] });
assert.equal(r.status, 400);
r = await call('ann', { action: 'checkout', lines: [{ variant_id: 'gid://shopify/ProductVariant/11', quantity: 2 }, { variant_id: 'evil', quantity: 1 }] });
assert.equal(r.status, 200); assert.equal(r.body.checkout_url, 'https://acme.myshopify.com/cart/c/abc');
const input = calls.at(-1).body.variables.input;
assert.deepEqual(input.lines, [{ merchandiseId: 'gid://shopify/ProductVariant/11', quantity: 2 }], 'bad lines dropped');
assert.equal(input.buyerIdentity.email, 'ann@x.com');
assert.ok(input.attributes.some((a) => a.key === 'Agent email' && a.value === 'ann@x.com'));

r = await call('ann', { action: 'disconnect' });
assert.equal(r.status, 403);
r = await call('boss', { action: 'disconnect' });
assert.equal(r.body.connected, false); assert.equal(__db.app_secret.length, 0);
console.log('gear store: all checks passed');
