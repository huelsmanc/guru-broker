// Comparable sales from the synced MLS data.
import { adminClient } from './base44.js';

const SOLD = ['Closed', 'Sold', 'CLOSED', 'SOLD', 'Closed Sale'];

export async function findSubject({ address, mls_number }) {
  const db = adminClient();
  if (mls_number) {
    const { data } = await db.from('mls_listing').select('*').eq('mls_number', String(mls_number).trim()).order('modified_at', { ascending: false }).limit(1);
    if (data?.[0]) return data[0];
  }
  if (address) {
    const street = String(address).split(',')[0].trim();
    if (street.length < 4) return null;
    const { data } = await db.from('mls_listing').select('*').ilike('street_address', `${street.replace(/[%_]/g, '')}%`).order('modified_at', { ascending: false }).limit(1);
    return data?.[0] || null;
  }
  return null;
}

/** Recent sales like the subject: nearby (or same ZIP/city), similar size, last N months. */
export async function findComps({ subject = {}, zip, city, beds, sqft, months = 6, radiusMiles = 1, limit = 25 }) {
  const db = adminClient();
  const since = new Date(Date.now() - months * 30.4 * 864e5).toISOString().slice(0, 10);
  const run = async (widen) => {
    let q = db.from('mls_listing').select('*').in('status', SOLD).gte('close_date', since).not('close_price', 'is', null);
    const lat = subject.latitude; const lng = subject.longitude;
    if (lat && lng) {
      const r = radiusMiles * (widen ? 2 : 1);
      const dLat = r / 69; const dLng = r / (69 * Math.cos((lat * Math.PI) / 180));
      q = q.gte('latitude', lat - dLat).lte('latitude', lat + dLat).gte('longitude', lng - dLng).lte('longitude', lng + dLng);
    } else if (zip || subject.zip) {
      q = q.eq('zip', zip || subject.zip);
    } else if (city || subject.city) {
      q = q.ilike('city', city || subject.city);
    } else {
      return [];
    }
    const b = beds ?? subject.beds;
    const a = sqft ?? subject.living_area;
    if (b && !widen) q = q.gte('beds', b - 1).lte('beds', b + 1);
    if (a && !widen) q = q.gte('living_area', a * 0.75).lte('living_area', a * 1.25);
    if (subject.property_type) q = q.eq('property_type', subject.property_type);
    if (subject.id) q = q.neq('id', subject.id);
    const { data, error } = await q.order('close_date', { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return data || [];
  };
  let comps = await run(false);
  if (comps.length < 4) comps = await run(true);
  return comps;
}

export function compSummary(c) {
  return {
    id: c.id,
    mls_number: c.mls_number,
    address: [c.street_address, c.unit ? `#${c.unit}` : null, c.city].filter(Boolean).join(', '),
    soldPrice: c.close_price,
    listPrice: c.list_price,
    soldDate: c.close_date,
    daysOnMarket: c.days_on_market,
    beds: c.beds,
    baths: c.baths_total,
    sqft: c.living_area,
    yearBuilt: c.year_built,
    lotAcres: c.lot_size_acres,
    photoUrl: (c.photos || [])[0] || null,
    remarks: (c.public_remarks || '').slice(0, 400),
  };
}
