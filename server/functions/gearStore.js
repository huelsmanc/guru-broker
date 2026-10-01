// New: the brokerage gear store. Each brokerage connects its own Shopify store (Shopify's free
// "Headless" sales channel gives a Storefront API token). Agents browse that store inside
// Guru Broker and check out on Shopify's own secure checkout page; card details never reach us.
//   { action: 'status' }                               -> { connected, shop_name, can_manage }
//   { action: 'connect', domain, token }  (admins)     -> { connected, shop_name }
//   { action: 'disconnect' }              (admins)     -> { connected: false }
//   { action: 'catalog', collection?, query?, after? } -> { collections, products, page }
//   { action: 'checkout', lines: [{ variant_id, quantity }] } -> { checkout_url }
// The token is kept in the server-only app_secret table, one row per brokerage.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';

export const SHOPIFY_API_VERSION = '2026-07';
const secretName = (brokerageId) => `shopify:${brokerageId}`;

class Problem extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

/** "My Store", "mystore", "https://mystore.myshopify.com/admin" -> "mystore.myshopify.com" */
export function cleanDomain(input) {
  let d = String(input || '').trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0];
  if (!d) return '';
  if (!d.includes('.')) d = `${d.replace(/[^a-z0-9-]/g, '')}.myshopify.com`;
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(d) ? d : '';
}

export async function storefront({ domain, token }, query, variables = {}) {
  let res;
  try {
    res = await fetch(`https://${domain}/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shopify-storefront-access-token': token },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new Problem(`Couldn't reach ${domain}. Check the store address.`, 502);
  }
  if (res.status === 401 || res.status === 403) throw new Problem('Shopify turned down the access token. Copy the Storefront API public access token again from the Headless channel.', 502);
  if (res.status === 404) throw new Problem(`${domain} isn't a Shopify store address. Use the one ending in .myshopify.com.`, 502);
  if (res.status === 402) throw new Problem('This Shopify store is paused or closed.', 502);
  if (!res.ok) throw new Problem(`Shopify said ${res.status}. Try again in a minute.`, 502);
  const body = await res.json().catch(() => ({}));
  if (body.errors?.length) throw new Problem(`Shopify: ${body.errors.map((e) => e.message).join('; ')}`, 502);
  return body.data;
}

const PRODUCT_FIELDS = `
  id handle title description vendor productType availableForSale
  featuredImage { url altText }
  images(first: 6) { nodes { url altText } }
  priceRange { minVariantPrice { amount currencyCode } maxVariantPrice { amount currencyCode } }
  options { name optionValues { name } }
  variants(first: 60) { nodes { id title availableForSale price { amount currencyCode } compareAtPrice { amount currencyCode } selectedOptions { name value } image { url altText } } }
`;
const PAGE = 24;

const money = (m) => (m ? { amount: Number(m.amount), currency: m.currencyCode } : null);
export function tidyProduct(p) {
  return {
    id: p.id, handle: p.handle, title: p.title, description: p.description || '', vendor: p.vendor || '', type: p.productType || '',
    available: !!p.availableForSale,
    image: p.featuredImage?.url || p.images?.nodes?.[0]?.url || null,
    images: (p.images?.nodes || []).map((i) => i.url),
    price_min: money(p.priceRange?.minVariantPrice), price_max: money(p.priceRange?.maxVariantPrice),
    options: (p.options || []).filter((o) => !(o.name === 'Title' && o.optionValues?.length === 1 && o.optionValues[0].name === 'Default Title'))
      .map((o) => ({ name: o.name, values: (o.optionValues || []).map((v) => v.name) })),
    variants: (p.variants?.nodes || []).map((v) => ({
      id: v.id, title: v.title, available: !!v.availableForSale,
      price: money(v.price), compare_at: money(v.compareAtPrice), image: v.image?.url || null,
      options: Object.fromEntries((v.selectedOptions || []).map((o) => [o.name, o.value])),
    })),
  };
}

async function readStore(brokerageId) {
  const { data } = await adminClient().from('app_secret').select('value').eq('name', secretName(brokerageId)).maybeSingle();
  return data?.value?.token ? data.value : null;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'status';
    const brokerageId = me.brokerage_id;
    const canManage = isAdminRole(me.role) || can(me, 'settings.manage');
    if (!brokerageId) return Response.json({ connected: false, can_manage: false, reason: 'Open a brokerage first.' });

    if (action === 'connect' || action === 'disconnect') {
      if (!canManage) throw new Problem('Only brokers and admins can connect the store.', 403);
      const db = adminClient();
      if (action === 'disconnect') {
        await db.from('app_secret').delete().eq('name', secretName(brokerageId));
        return Response.json({ connected: false, can_manage: true });
      }
      const domain = cleanDomain(body.domain);
      const token = String(body.token || '').trim();
      if (!domain) throw new Problem('Add your store address, like yourstore.myshopify.com.');
      if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) throw new Problem('Paste the Storefront API access token from the Headless channel.');
      const data = await storefront({ domain, token }, '{ shop { name } }');
      const value = { domain, token, shop_name: data?.shop?.name || domain, connected_by: me.email, connected_at: new Date().toISOString() };
      const { error } = await db.from('app_secret').upsert({ name: secretName(brokerageId), value }, { onConflict: 'name' });
      if (error) throw new Problem(error.message, 500);
      return Response.json({ connected: true, shop_name: value.shop_name, can_manage: true });
    }

    const store = await readStore(brokerageId);
    if (action === 'status') return Response.json(store ? { connected: true, shop_name: store.shop_name, can_manage: canManage } : { connected: false, can_manage: canManage });
    if (!store) throw new Problem("Your brokerage hasn't connected its store yet.", 404);

    if (action === 'catalog') {
      const after = body.after ? String(body.after).slice(0, 300) : null;
      const q = String(body.query || '').replace(/["\\]/g, ' ').trim().slice(0, 80);
      const handle = body.collection ? String(body.collection).slice(0, 120) : null;
      const vars = { first: PAGE, after };
      let products; let page;
      if (handle) {
        const d = await storefront(store, `query($h: String!, $first: Int!, $after: String) { collection(handle: $h) { products(first: $first, after: $after) { pageInfo { hasNextPage endCursor } nodes { ${PRODUCT_FIELDS} } } } }`, { ...vars, h: handle });
        products = d?.collection?.products; page = products?.pageInfo;
      } else {
        const d = await storefront(store, `query($first: Int!, $after: String, $q: String) { products(first: $first, after: $after, query: $q, sortKey: ${q ? 'RELEVANCE' : 'BEST_SELLING'}) { pageInfo { hasNextPage endCursor } nodes { ${PRODUCT_FIELDS} } } }`, { ...vars, q: q || null });
        products = d?.products; page = products?.pageInfo;
      }
      let collections;
      if (!after) {
        const c = await storefront(store, '{ collections(first: 30) { nodes { handle title products(first: 1) { nodes { id } } } } }');
        collections = (c?.collections?.nodes || []).filter((x) => x.products?.nodes?.length && x.handle !== 'frontpage').map((x) => ({ handle: x.handle, title: x.title }));
      }
      return Response.json({ shop_name: store.shop_name, collections, products: (products?.nodes || []).map(tidyProduct), page: { more: !!page?.hasNextPage, after: page?.endCursor || null } });
    }

    if (action === 'checkout') {
      const lines = (Array.isArray(body.lines) ? body.lines : [])
        .map((l) => ({ merchandiseId: String(l.variant_id || ''), quantity: Math.floor(Number(l.quantity)) }))
        .filter((l) => /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(l.merchandiseId) && l.quantity > 0);
      if (!lines.length) throw new Problem('Your cart is empty.');
      if (lines.length > 50 || lines.some((l) => l.quantity > 99)) throw new Problem('That cart is too big for one order.');
      const name = me.display_name || me.full_name || me.email;
      const d = await storefront(store, `mutation($input: CartInput!) { cartCreate(input: $input) { cart { id checkoutUrl } userErrors { field message } } }`, {
        input: {
          lines,
          buyerIdentity: { email: me.email },
          note: `Ordered in Guru Broker by ${name} (${me.email})`,
          attributes: [{ key: 'Agent', value: String(name).slice(0, 200) }, { key: 'Agent email', value: me.email }, { key: 'Ordered from', value: 'Guru Broker' }],
        },
      });
      const errs = d?.cartCreate?.userErrors || [];
      if (errs.length) throw new Problem(errs.map((e) => e.message).join('; '));
      const url = d?.cartCreate?.cart?.checkoutUrl;
      if (!url) throw new Problem("Shopify didn't return a checkout page. Try again.", 502);
      return Response.json({ checkout_url: url });
    }
    throw new Problem('Unknown action');
  } catch (error) {
    if (!(error instanceof Problem)) console.error('gearStore:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
