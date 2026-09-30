// New: look up MLS listings. { mls_number } or { q: address } -> best matches;
// { comps: {...} } -> recent comparable sales.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { findSubject, findComps, compSummary } from '../lib/comps.js';

export default async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();
    const { mls_number, q, comps } = await req.json();
    if (comps) {
      const subject = (await findSubject(comps)) || {};
      const rows = await findComps({ ...comps, subject });
      return Response.json({ subject: subject.id ? subject : null, comps: rows.map(compSummary) });
    }
    if (mls_number) {
      const hit = await findSubject({ mls_number });
      return Response.json({ listing: hit });
    }
    if (q && String(q).trim().length >= 3) {
      const term = String(q).trim().replace(/[%_,()"']/g, ' ').replace(/\s+/g, ' ');
      const { data } = await adminClient().from('mls_listing').select('id, mls_number, status, street_address, unit, city, state, zip, list_price, close_price, beds, baths_total, living_area, photos')
        .or(`street_address.ilike.%${term}%,mls_number.eq.${term}`)
        .order('modified_at', { ascending: false }).limit(10);
      return Response.json({ results: data || [] });
    }
    return Response.json({ error: 'Give an MLS number, an address, or comps criteria' }, { status: 400 });
  } catch (error) {
    console.error('mlsSearch:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
