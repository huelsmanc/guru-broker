// Print shop products, sizes and default retail prices. Prices are what the agent pays (in cents),
// set by the platform owner in Print settings; these are only the starting values.
// Sizes are in inches; every print file includes a 1/8" bleed on each side.

export const BLEED = 0.125;

export const PRODUCTS = {
  postcard_4x6: {
    label: '4×6 postcard (mailed)', short: 'Postcard 4×6', vendor: 'lob', lobSize: '4x6', trim: [6, 4], sides: 2, mailed: true,
    // Back: keep this box clear for the address and postage (from the right/bottom trim edges).
    inkFree: { w: 3.2835, h: 2.375, right: 0.275, bottom: 0.25 },
    blurb: 'Printed, addressed and mailed first class to your list. Postage included.',
  },
  postcard_6x9: {
    label: '6×9 postcard (mailed)', short: 'Postcard 6×9', vendor: 'lob', lobSize: '6x9', trim: [9, 6], sides: 2, mailed: true,
    inkFree: { w: 4, h: 2.375, right: 0.275, bottom: 0.25 },
    blurb: 'Bigger and bolder. Printed, addressed and mailed to your list. Postage included.',
  },
  flyer_letter: {
    label: 'Flyers 8.5×11 (shipped to you)', short: 'Flyers', vendor: 'gelato', trim: [8.5, 11], sides: 1,
    quantities: [25, 50, 100, 250, 500],
    blurb: 'Glossy full-color flyers for open houses and showings, shipped to your door.',
  },
  business_cards: {
    label: 'Business cards (shipped to you)', short: 'Business cards', vendor: 'gelato', trim: [3.5, 2], sides: 2,
    quantities: [100, 250, 500, 1000],
    blurb: 'Two-sided cards on thick cover stock, shipped to your door.',
  },
};

export const DEFAULT_SETTINGS = {
  test_mode: true,
  prices: {
    postcard_4x6: { each: 119 },
    postcard_6x9: { each: 149 },
    flyer_letter: { 25: 2900, 50: 3900, 100: 5900, 250: 10900, 500: 17900 },
    business_cards: { 100: 2900, 250: 4500, 500: 6900, 1000: 9900 },
  },
  // Gelato product codes. Check each one in Print settings before going live.
  gelato_uids: {
    flyer_letter: 'flyers_pf_8-5x11-inch_pt_100-lb-text-coated-silk_cl_4-0_ver',
    business_cards: 'cards_pf_bx_pt_110-lb-cover-uncoated_cl_4-4_hor',
  },
  min_recipients: 1,
  max_recipients: 5000,
};

export function withDefaults(s = {}) {
  return {
    ...DEFAULT_SETTINGS, ...s,
    prices: Object.fromEntries(Object.keys(PRODUCTS).map((k) => [k, { ...DEFAULT_SETTINGS.prices[k], ...(s.prices?.[k] || {}) }])),
    gelato_uids: { ...DEFAULT_SETTINGS.gelato_uids, ...(s.gelato_uids || {}) },
  };
}

/** Price in cents: mailed postcards by recipient, shipped prints by quantity tier. */
export function priceFor(productKey, { quantity, recipients } = {}, settings = DEFAULT_SETTINGS) {
  const p = PRODUCTS[productKey];
  if (!p) return null;
  const table = withDefaults(settings).prices[productKey] || {};
  if (p.mailed) return Math.max(0, Math.round(Number(table.each || 0))) * Math.max(0, Number(recipients || 0));
  const q = Number(quantity);
  return p.quantities.includes(q) && table[q] != null ? Math.round(Number(table[q])) : null;
}

/** Print file size in pixels at 300 dpi, bleed included. */
export function printPixels(productKey, dpi = 300) {
  const [w, h] = PRODUCTS[productKey].trim;
  return { w: Math.round((w + BLEED * 2) * dpi), h: Math.round((h + BLEED * 2) * dpi) };
}

export const money = (cents) => `$${(Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU'.split(' '));

const STATE_NAMES = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'puerto rico': 'PR' };

// Spreadsheets drop the leading zero from New England ZIPs (06473 -> 6473): put it back.
function fixZip(z) {
  const raw = String(z ?? '').trim();
  const d = raw.replace(/\D/g, '');
  if (/^\d{5}(-\d{4})?$/.test(raw)) return raw;
  if (d.length === 3 || d.length === 4) return d.padStart(5, '0');
  if (d.length === 5) return d;
  if (d.length === 8 || d.length === 9) { const n = d.padStart(9, '0'); return `${n.slice(0, 5)}-${n.slice(5)}`; }
  return raw;
}

/** Cleans one mailing address. Returns { address } or { error }. */
export function cleanAddress(a = {}) {
  const t = (v, n = 64) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const out = {
    name: t(a.name || [a.first_name, a.last_name].filter(Boolean).join(' '), 40) || 'Current Resident',
    address_line1: t(a.address_line1 || a.address || a.street, 64),
    address_line2: t(a.address_line2 || a.unit || '', 64),
    city: t(a.city, 40),
    state: STATE_NAMES[t(a.state, 30).toLowerCase().replace(/\./g, '')] || t(a.state, 30).replace(/\./g, '').toUpperCase(),
    zip: fixZip(a.zip || a.zip_code || a.postal_code),
  };
  if (!out.address_line1) return { error: 'missing street address' };
  if (!out.city) return { error: 'missing city' };
  if (!US_STATES.has(out.state)) return { error: `state "${out.state}" isn't a US state (use CT or Connecticut)` };
  if (!/^\d{5}(-\d{4})?$/.test(out.zip)) return { error: `ZIP "${out.zip}" isn't 5 digits` };
  return { address: out };
}

/** Reads a CSV of addresses (any column order; common header names understood). */
export function parseAddressCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let q = false;
  const s = String(text || '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (q) { if (ch === '"' && s[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const data = rows.filter((r) => r.some((c) => c.trim()));
  if (!data.length) return { recipients: [], problems: [] };
  const head = data[0].map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const find = (...names) => head.findIndex((h) => names.includes(h));
  const col = {
    name: find('name', 'fullname', 'owner', 'ownername', 'recipient', 'contact'),
    first: find('firstname', 'first'), last: find('lastname', 'last'),
    line1: find('address', 'address1', 'addressline1', 'street', 'streetaddress', 'mailingaddress', 'propertyaddress', 'mailingstreet', 'siteaddress'),
    line2: find('address2', 'addressline2', 'unit', 'apt', 'suite'),
    city: find('city', 'town', 'mailingcity'), state: find('state', 'st', 'mailingstate'), zip: find('zip', 'zipcode', 'postalcode', 'postcode', 'mailingzip'),
  };
  if (col.line1 < 0 || col.city < 0 || col.state < 0 || col.zip < 0) {
    return { recipients: [], problems: [{ row: 1, error: 'The first row needs column names: address, city, state and zip (name is optional).' }] };
  }
  const recipients = []; const problems = []; const seen = new Set();
  data.slice(1).forEach((r, i) => {
    const g = (k) => (col[k] >= 0 ? r[col[k]] : '');
    const { address, error } = cleanAddress({ name: g('name') || [g('first'), g('last')].filter(Boolean).join(' '), address_line1: g('line1'), address_line2: g('line2'), city: g('city'), state: g('state'), zip: g('zip') });
    if (error) { problems.push({ row: i + 2, error }); return; }
    const key = `${address.address_line1}|${address.address_line2}|${address.zip}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key); recipients.push(address);
  });
  return { recipients, problems };
}

/** "17 Debra Ln, North Haven, CT 06473, USA" -> { address_line1, city, state, zip } (or null). */
export function splitAddress(text) {
  const parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean).filter((s) => !/^(usa|us|united states)$/i.test(s));
  if (parts.length < 3) return null;
  const m = parts[parts.length - 1].match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (!m) return null;
  const city = parts[parts.length - 2];
  const street = parts.slice(0, parts.length - 2);
  return { address_line1: street[0], address_line2: street.slice(1).join(', '), city, state: m[1].toUpperCase(), zip: m[2] };
}
