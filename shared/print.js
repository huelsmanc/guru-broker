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
// Splits CSV text into rows. Handles quotes, and files saved with tabs or semicolons instead of commas.
function csvRows(text) {
  const src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = src.split('\n').find((l) => l.trim()) || '';
  const count = (ch) => firstLine.replace(/"[^"]*"/g, '').split(ch).length - 1;
  const sep = [',', '\t', ';', '|'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
  const rows = [];
  let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (q) { if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

const ZIP_RE = /^\d{3,5}(-\d{4})?$/;
const isState = (v) => /^[A-Za-z]{2}$/.test(v) || !!STATE_NAMES[String(v).toLowerCase().replace(/\./g, '')];

// Finds the columns from the header row. Names vary a lot between CRMs, MLS exports and list
// vendors ("Mailing Address", "Property Zip Code", "State/Province"...), so this matches on the
// words inside each name, and prefers mailing columns over property columns when a file has both.
function headerColumns(header) {
  const h = header.map((x) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  const pick = (test, avoid) => {
    const hits = h.map((x, i) => (test(x) && !(avoid && avoid(x)) ? i : -1)).filter((i) => i >= 0);
    if (!hits.length) return -1;
    return hits.find((i) => /mail/.test(h[i])) ?? hits.find((i) => !/propert|site|situs/.test(h[i])) ?? hits[0];
  };
  const notLine1 = (x) => /email|e mail|city|state|zip|postal|\b2\b|line 2|unit|apt|suite|web|url/.test(x);
  return {
    name: pick((x) => /^(full )?name$|owner|recipient|contact name|^contact$|addressee|^mail(ing)? name/.test(x), (x) => /first|last|company|address|email|street|city|town|state|province|zip|postal|phone|unit|apt/.test(x)),
    first: pick((x) => /first/.test(x) && !/address/.test(x)),
    last: pick((x) => /last|surname/.test(x) && !/address|sale|sold|modified|updated/.test(x)),
    line1: pick((x) => /address|street|addr\b|^addr/.test(x), notLine1),
    line2: pick((x) => /address 2|address line 2|addr 2|\bunit\b|\bapt\b|suite/.test(x), (x) => /email/.test(x)),
    city: pick((x) => /city|town/.test(x)),
    state: pick((x) => /^st$|state|province|^region$/.test(x), (x) => /statement|status|street/.test(x)),
    zip: pick((x) => /zip|postal|post code|postcode/.test(x)),
  };
}

// No usable header: work out the columns from what's in them.
function guessColumns(rows) {
  const n = Math.max(...rows.map((r) => r.length));
  const share = (i, test) => rows.filter((r) => r[i] && test(r[i])).length / rows.length;
  const best = (test, skip = []) => {
    let at = -1; let top = 0.5;
    for (let i = 0; i < n; i += 1) { if (skip.includes(i)) continue; const v = share(i, test); if (v > top) { top = v; at = i; } }
    return at;
  };
  const zip = best((v) => ZIP_RE.test(v));
  const state = best(isState, [zip]);
  const line1 = best((v) => /^\d+[A-Za-z]?\s+\S/.test(v), [zip, state]);
  const city = state > 0 && ![zip, line1].includes(state - 1) ? state - 1 : -1;
  const name = best((v) => /^[A-Za-z][A-Za-z .,'&-]+$/.test(v) && !isState(v), [zip, state, line1, city]);
  return { name, first: -1, last: -1, line1, line2: -1, city, state, zip };
}

export function parseAddressCsv(text) {
  if (/^PK\u0003\u0004/.test(String(text || '')) || /\u0000/.test(String(text || '').slice(0, 2000))) {
    return { recipients: [], problems: [{ row: 1, error: 'That looks like an Excel or Numbers file. Open it and choose File > Export (or Save As) > CSV, then upload the .csv.' }] };
  }
  const data = csvRows(text);
  if (!data.length) return { recipients: [], problems: [] };
  let col = headerColumns(data[0]);
  let body = data.slice(1); let first = 2;
  const headerLooksLikeData = data[0].some((c) => ZIP_RE.test(c)) && data[0].some((c) => /^\d+\s+\S/.test(c));
  if (headerLooksLikeData || (col.line1 < 0 && col.zip < 0)) {
    const g = guessColumns(headerLooksLikeData ? data : data.slice(1));
    if (g.line1 >= 0 && g.zip >= 0) { col = g; if (headerLooksLikeData) { body = data; first = 1; } }
  }
  // One "full address" column ("17 Debra Ln, North Haven, CT 06473") is fine too.
  const oneColumn = col.line1 >= 0 && (col.city < 0 || col.state < 0 || col.zip < 0);
  if (col.line1 < 0 || (oneColumn && !body.slice(0, 20).some((r) => splitAddress(r[col.line1])))) {
    const names = data[0].filter(Boolean).slice(0, 12).join(', ');
    return { recipients: [], problems: [{ row: 1, error: `Couldn't tell which columns hold the address. Your columns are: ${names || '(none)'}. Rename them to address, city, state and zip (name is optional), or use one column with the full address.` }] };
  }
  const recipients = []; const problems = []; const seen = new Set();
  body.forEach((r, i) => {
    const g = (k) => (col[k] >= 0 ? r[col[k]] || '' : '');
    let parts = { address_line1: g('line1'), address_line2: g('line2'), city: g('city'), state: g('state'), zip: g('zip') };
    if (oneColumn) {
      const sp = splitAddress(g('line1'));
      if (sp) parts = { ...sp, address_line2: sp.address_line2 || g('line2') };
    }
    const fullName = g('name') || [g('first'), g('last')].filter(Boolean).join(' ');
    const { address, error } = cleanAddress({ name: fullName, ...parts });
    if (error) { problems.push({ row: i + first, error }); return; }
    const key = `${address.address_line1}|${address.address_line2}|${address.zip}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key); recipients.push(address);
  });
  return { recipients, problems };
}

/** "17 Debra Ln, North Haven, CT 06473, USA" -> { address_line1, city, state, zip } (or null). */
export function splitAddress(text) {
  let parts = String(text || '').split(',').map((s) => s.trim()).filter(Boolean).filter((s) => !/^(usa|us|united states( of america)?)$/i.test(s));
  // "..., CT, 06412" -> "..., CT 06412"
  if (parts.length >= 4 && /^\d{3,5}(-\d{4})?$/.test(parts[parts.length - 1])) parts = [...parts.slice(0, -2), `${parts[parts.length - 2]} ${parts[parts.length - 1]}`];
  if (parts.length < 3) return null;
  const m = parts[parts.length - 1].match(/^([A-Za-z][A-Za-z. ]*?)\s+(\d{3,5}(?:-\d{4})?)$/);
  if (!m) return null;
  const st = m[1].replace(/\./g, '').trim();
  const state = STATE_NAMES[st.toLowerCase()] || (st.length === 2 ? st.toUpperCase() : null);
  if (!state) return null;
  const city = parts[parts.length - 2];
  const street = parts.slice(0, parts.length - 2);
  return { address_line1: street[0], address_line2: street.slice(1).join(', '), city, state, zip: m[2] };
}
