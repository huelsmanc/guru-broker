// New: listing kits. A ready-made set of marketing for a moment in a deal: a mailable postcard,
// a flyer, a square post and a story, all written once by AI and filled with the property's facts
// and photos. Made automatically:
//   - a listing deal goes under contract (new listing-side deal)   -> "Under contract"
//   - any deal closes                                              -> "Just sold"
//   - the agent's own new listing shows up Active in the MLS feed   -> "Just listed" (hourly scan)
// or on request: { action: 'make', kind, transaction_id | mls_id }.
import { createClientFromRequest, isServiceRequest, adminClient } from '../lib/base44.js';
import { notifyPeople } from '../lib/team.js';
import { writeMarketing } from '../lib/marketingCopy.js';

const lc = (e) => String(e || '').toLowerCase().trim();
const LABEL = { just_listed: 'Just listed', under_contract: 'Under contract', just_sold: 'Just sold', price_reduced: 'Price improved', open_house: 'Open house', coming_soon: 'Coming soon' };
const FORMATS = [['postcard_4x6', 'postcard'], ['flyer', 'flyer'], ['post', 'social post'], ['story', 'story']];

export function splitTxAddress(text) {
  const parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean).filter((s) => !/^(usa|us)$/i.test(s));
  const out = { street_address: parts[0] || '' };
  const last = parts[parts.length - 1] || '';
  const m = last.match(/^([A-Za-z]{2})\s*(\d{5})?/);
  if (m && parts.length >= 3) { out.state = m[1].toUpperCase(); out.zip = m[2] || ''; out.city = parts[parts.length - 2]; }
  else if (parts.length >= 2) out.city = parts[1];
  // "43 Goose Hill Rd, Chester, CT 06412, Chester, CT, 06412" style duplicates: keep the first set.
  const zip = String(text || '').match(/\b(\d{5})\b/);
  if (!out.zip && zip) out.zip = zip[1];
  return out;
}

async function mlsMatch({ mlsId, mlsNumber, street, zip }) {
  const db = adminClient();
  if (mlsId) return (await db.from('mls_listing').select('*').eq('id', mlsId).maybeSingle()).data;
  if (mlsNumber) { const { data } = await db.from('mls_listing').select('*').eq('mls_number', String(mlsNumber)).limit(1); if (data?.[0]) return data[0]; }
  if (street) {
    let q = db.from('mls_listing').select('*').ilike('street_address', `${street.replace(/[%_]/g, '')}%`);
    if (zip) q = q.eq('zip', zip);
    const { data } = await q.order('modified_at', { ascending: false }).limit(1);
    return data?.[0] || null;
  }
  return null;
}

function listingFrom(tx, mls) {
  const a = splitTxAddress(tx?.property_address);
  return {
    street_address: mls?.street_address || a.street_address, unit: mls?.unit || '', city: mls?.city || a.city || '', state: mls?.state || a.state || '', zip: mls?.zip || a.zip || '',
    price: tx?.sale_price || mls?.close_price || mls?.list_price || null,
    beds: mls?.beds ?? null, baths_total: mls?.baths_total ?? null, living_area: mls?.living_area ?? null, lot_size_acres: mls?.lot_size_acres ?? null,
    year_built: mls?.year_built ?? null, public_remarks: mls?.public_remarks || null, mls_number: mls?.mls_number || tx?.mls_number || null,
    transaction_id: tx?.id || null, id: mls?.id || null,
  };
}

/** Makes one kit (once per agent and moment). Returns { kit_id, designs } or { skipped }. */
export async function makeKit(E, { kind, owner, tx, mls, key, notify = true }) {
  const ownerEmail = lc(owner.email);
  const [dup] = await E.MarketingDesign.filter({ owner_email: ownerEmail, kit_key: key }, '-created_date', 1).catch(() => []);
  if (dup) return { skipped: 'already made', kit_id: dup.kit_id };
  const [settings] = await E.BrokerageSettings.filter({ brokerage_id: owner.brokerage_id }, '-created_date', 1).catch(() => []);
  const listing = listingFrom(tx, mls);
  const side = tx?.deal_type;
  const prompt = kind === 'just_sold' && side === 'buyer' ? 'I represented the buyers on this sale. Say so plainly; do not imply I was the listing agent.'
    : kind === 'just_sold' ? 'Celebrate the sale and invite neighbors thinking about selling to reach out.'
      : kind === 'under_contract' ? 'Announce it went under contract quickly and invite neighbors thinking about selling to call.'
        : 'Announce the new listing to the neighborhood and invite them to a showing.';
  const content = await writeMarketing({ kind, listing, prompt, agentName: owner.display_name || owner.full_name || ownerEmail, brandColor: owner.brand_color || settings?.primary_color });
  const kitId = `kit_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const title = `${LABEL[kind] || kind}: ${listing.street_address || 'your property'}`;
  const photos = Array.isArray(mls?.photos) ? mls.photos.map((p) => (typeof p === 'string' ? p : p?.url || p?.MediaURL)).filter(Boolean).slice(0, 6) : [];
  const designs = [];
  for (const [format, word] of FORMATS) {
    designs.push(await E.MarketingDesign.create({
      brokerage_id: owner.brokerage_id, owner_email: ownerEmail, title: `${title} (${word})`, kind, format, template: content.template,
      transaction_id: tx?.id || null, listing_id: mls?.id || null, kit_id: kitId, kit_key: key, kit_title: title,
      data: { listing, photos, content, prompt: '', style: '' },
    }));
  }
  if (notify) {
    await notifyPeople(E, {
      brokerageId: owner.brokerage_id, people: [{ email: ownerEmail, name: owner.display_name || owner.full_name }],
      title: `Your ${LABEL[kind] || ''} kit is ready`.replace(/\s+/g, ' '),
      message: `${title}: a postcard, flyer, social post and story are ready to review, mail or share.`,
      link: '/Marketing?tab=kits', referenceId: kitId, referenceType: 'MarketingKit', pushKind: 'deal',
    }).catch(() => {});
  }
  return { kit_id: kitId, designs: designs.map((d) => d.id) };
}

async function ownerOf(E, email) {
  const [u] = await E.User.filter({ email: lc(email) }, '-created_date', 1).catch(() => []);
  return u || null;
}

export default async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req);
    const E = base44.asServiceRole.entities;

    // Database automation: a deal was added or changed.
    if (body.event) {
      if (!isServiceRequest(req)) return Response.json({ error: 'Not available' }, { status: 403 });
      const { type, data: tx, old_data: old } = body.event;
      if (!tx?.id || tx.imported || !tx.agent_email) return Response.json({ skipped: 'n/a' });
      let kind = null;
      if (type === 'update' && tx.status === 'closed' && old?.status !== 'closed') kind = 'just_sold';
      else if (type === 'create' && ['listing', 'dual'].includes(tx.deal_type) && tx.status !== 'closed') kind = 'under_contract';
      if (!kind) return Response.json({ skipped: 'no kit moment' });
      const owner = await ownerOf(E, tx.agent_email);
      if (!owner?.brokerage_id) return Response.json({ skipped: 'no agent' });
      const a = splitTxAddress(tx.property_address);
      const mls = await mlsMatch({ mlsNumber: tx.mls_number, street: a.street_address, zip: a.zip }).catch(() => null);
      return Response.json(await makeKit(E, { kind, owner, tx, mls, key: `${kind}:tx:${tx.id}` }));
    }

    // Hourly: agents' own new listings in the MLS feed.
    if (body.scan) {
      if (!isServiceRequest(req)) return Response.json({ error: 'Not available' }, { status: 403 });
      const since = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
      const { data: fresh } = await adminClient().from('mls_listing').select('*').eq('status', 'Active').gte('list_date', since).not('list_agent_email', 'is', null).limit(300);
      let made = 0;
      for (const m of fresh || []) {
        if (made >= 10) break;
        const owner = await ownerOf(E, m.list_agent_email);
        if (!owner?.brokerage_id || owner.suspended) continue;
        const r = await makeKit(E, { kind: 'just_listed', owner, tx: null, mls: m, key: `just_listed:mls:${m.id}` });
        if (!r.skipped) made += 1;
      }
      return Response.json({ made });
    }

    // An agent asks for a kit now.
    const me = await base44.auth.me();
    if (body.action !== 'make') return Response.json({ error: 'Unknown action' }, { status: 400 });
    const kind = LABEL[body.kind] ? body.kind : 'just_listed';
    let tx = null; let mls = null;
    if (body.transaction_id) {
      tx = await base44.entities.Transaction.get(String(body.transaction_id)).catch(() => null);
      if (!tx) return Response.json({ error: 'Deal not found' }, { status: 404 });
      const a = splitTxAddress(tx.property_address);
      mls = await mlsMatch({ mlsNumber: tx.mls_number, street: a.street_address, zip: a.zip }).catch(() => null);
    } else if (body.mls_id) {
      mls = await mlsMatch({ mlsId: String(body.mls_id) });
      if (!mls) return Response.json({ error: 'Listing not found' }, { status: 404 });
    } else return Response.json({ error: 'Pick a deal or an MLS listing' }, { status: 400 });
    const owner = { ...me, email: me.email };
    const key = `${kind}:${tx ? `tx:${tx.id}` : `mls:${mls.id}`}:${body.again ? Date.now() : 'v1'}`;
    return Response.json(await makeKit(E, { kind, owner, tx, mls, key, notify: false }));
  } catch (error) {
    console.error('listingKit:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
