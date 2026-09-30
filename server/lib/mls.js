// MLS feeds: one connector per MLS, RETS (SmartMLS today) or RESO Web API.
//
// Configure in Vercel environment variables:
//   MLS_SOURCES=smartmls                     comma-separated ids
//   SMARTMLS_TYPE=rets                       rets | webapi
//   SMARTMLS_FEED=vow                        idx | vow | broker (what the data may be used for)
// RETS:
//   SMARTMLS_LOGIN_URL, SMARTMLS_USERNAME, SMARTMLS_PASSWORD
//   SMARTMLS_USER_AGENT (default GuruBroker/1.0), SMARTMLS_UA_PASSWORD (if required)
//   SMARTMLS_RETS_VERSION (default RETS/1.7.2)
//   SMARTMLS_RESOURCE (default Property), SMARTMLS_CLASS (e.g. Property, RE_1, RESI)
//   SMARTMLS_STANDARD_NAMES (default 1: ask for RESO field names)
//   SMARTMLS_QUERY (extra DMQL2, optional), SMARTMLS_FIELD_MAP (JSON {ourField: theirField}, optional)
// Web API:
//   SMARTMLS_API_URL (OData root, e.g. https://api.example.com/odata), SMARTMLS_TOKEN

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Config

export function mlsSources() {
  return (process.env.MLS_SOURCES || '').split(',').map((s) => s.trim()).filter(Boolean).map((id) => {
    const P = id.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const env = (k, d) => process.env[`${P}_${k}`] ?? d;
    let fieldMap = {};
    try { fieldMap = JSON.parse(env('FIELD_MAP', '{}')); } catch { /* ignore */ }
    return {
      id,
      type: env('TYPE', 'rets').toLowerCase(),
      feed: env('FEED', 'idx').toLowerCase(),
      loginUrl: env('LOGIN_URL'),
      username: env('USERNAME'),
      password: env('PASSWORD'),
      userAgent: env('USER_AGENT', 'GuruBroker/1.0'),
      uaPassword: env('UA_PASSWORD', ''),
      version: env('RETS_VERSION', 'RETS/1.7.2'),
      resource: env('RESOURCE', 'Property'),
      class: env('CLASS', 'Property'),
      standardNames: env('STANDARD_NAMES', '1') === '1',
      query: env('QUERY', ''),
      apiUrl: env('API_URL'),
      token: env('TOKEN'),
      fieldMap,
      batch: Number(env('BATCH', '500')),
    };
  });
}

// ---------------------------------------------------------------------------
// RETS client (HTTP Digest auth, session cookie, COMPACT-DECODED search)

const md5 = (s) => createHash('md5').update(s).digest('hex');

export class RetsClient {
  constructor(cfg) {
    this.cfg = cfg;
    this.cookies = new Map();
    this.urls = {};
    this.sessionId = '';
    this.nc = 0;
  }

  headers(extra = {}) {
    const h = {
      'User-Agent': this.cfg.userAgent,
      'RETS-Version': this.cfg.version,
      Accept: '*/*',
      ...extra,
    };
    if (this.cfg.uaPassword) {
      const a1 = md5(`${this.cfg.userAgent}:${this.cfg.uaPassword}`);
      h['RETS-UA-Authorization'] = `Digest ${md5(`${a1}::${this.sessionId}:${this.cfg.version}`)}`;
    }
    if (this.cookies.size) h.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    return h;
  }

  keepCookies(res) {
    const raw = res.headers.getSetCookie?.() || (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    for (const c of raw) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) {
        const k = pair.slice(0, i).trim();
        const v = pair.slice(i + 1).trim();
        this.cookies.set(k, v);
        if (k === 'RETS-Session-ID') this.sessionId = v;
      }
    }
  }

  digestHeader(challenge, method, url) {
    const p = {};
    challenge.replace(/(\w+)=("([^"]*)"|[^,\s]+)/g, (_, k, __, q, ) => { p[k] = q ?? _.split('=')[1]; });
    const uri = new URL(url);
    const path = uri.pathname + uri.search;
    const ha1 = md5(`${this.cfg.username}:${p.realm}:${this.cfg.password}`);
    const ha2 = md5(`${method}:${path}`);
    const qop = p.qop ? p.qop.split(',').map((s) => s.trim()).includes('auth') ? 'auth' : p.qop.split(',')[0] : null;
    const nc = (++this.nc).toString(16).padStart(8, '0');
    const cnonce = md5(String(Math.random())).slice(0, 16);
    const response = qop ? md5(`${ha1}:${p.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${p.nonce}:${ha2}`);
    this.digest = p;
    return `Digest username="${this.cfg.username}", realm="${p.realm}", nonce="${p.nonce}", uri="${path}", response="${response}"`
      + (p.opaque ? `, opaque="${p.opaque}"` : '')
      + (qop ? `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"` : '')
      + (p.algorithm ? `, algorithm=${p.algorithm}` : '');
  }

  async request(url, { raw = false } = {}) {
    let res = await fetch(url, { headers: this.headers(this.authHeader ? { Authorization: this.authFor(url) } : {}) });
    if (res.status === 401) {
      const challenge = res.headers.get('www-authenticate') || '';
      if (!/digest/i.test(challenge)) {
        // Basic auth servers
        this.authFor = () => `Basic ${Buffer.from(`${this.cfg.username}:${this.cfg.password}`).toString('base64')}`;
      } else {
        this.authFor = (u) => this.digestHeader(challenge, 'GET', u);
      }
      this.authHeader = true;
      res = await fetch(url, { headers: this.headers({ Authorization: this.authFor(url) }) });
    }
    this.keepCookies(res);
    if (!res.ok) throw new Error(`RETS ${res.status} ${res.statusText} for ${new URL(url).pathname}`);
    if (raw) return res;
    return res.text();
  }

  async login() {
    const body = await this.request(this.cfg.loginUrl);
    checkReply(body);
    const base = new URL(this.cfg.loginUrl);
    for (const line of body.split(/\r?\n/)) {
      const m = line.match(/^\s*(\w+)\s*=\s*(\S+)\s*$/);
      if (m) this.urls[m[1].toLowerCase()] = new URL(m[2], base).toString();
    }
    if (!this.urls.search) throw new Error('RETS login did not return a Search URL');
    return this.urls;
  }

  async search({ query, limit = 500, offset = 1, select }) {
    const u = new URL(this.urls.search);
    u.searchParams.set('SearchType', this.cfg.resource);
    u.searchParams.set('Class', this.cfg.class);
    u.searchParams.set('Query', query);
    u.searchParams.set('QueryType', 'DMQL2');
    u.searchParams.set('Format', 'COMPACT-DECODED');
    u.searchParams.set('Count', '1');
    u.searchParams.set('Limit', String(limit));
    u.searchParams.set('Offset', String(offset));
    u.searchParams.set('StandardNames', this.cfg.standardNames ? '1' : '0');
    if (select) u.searchParams.set('Select', select);
    const body = await this.request(u.toString());
    return parseCompact(body);
  }

  async photoUrls(listingKey, max = 25) {
    if (!this.urls.getobject) return [];
    const u = new URL(this.urls.getobject);
    u.searchParams.set('Resource', this.cfg.resource);
    u.searchParams.set('Type', 'Photo');
    u.searchParams.set('ID', `${listingKey}:*`);
    u.searchParams.set('Location', '1');
    try {
      const res = await this.request(u.toString(), { raw: true });
      const text = await res.text();
      const urls = [...text.matchAll(/Location:\s*(\S+)/gi)].map((m) => m[1]);
      return urls.slice(0, max);
    } catch {
      return [];
    }
  }

  async logout() {
    if (this.urls.logout) await this.request(this.urls.logout).catch(() => {});
  }
}

function checkReply(body) {
  const m = body.match(/<RETS\s+ReplyCode="(\d+)"\s+ReplyText="([^"]*)"/i);
  if (m && m[1] !== '0' && m[1] !== '20201') throw new Error(`RETS error ${m[1]}: ${m[2]}`);
  return m ? Number(m[1]) : 0;
}

export function parseCompact(body) {
  const code = checkReply(body);
  if (code === 20201) return { count: 0, rows: [], maxRows: false }; // no records found
  const delimHex = body.match(/<DELIMITER\s+value="([0-9A-Fa-f]{2})"/i)?.[1] || '09';
  const d = String.fromCharCode(parseInt(delimHex, 16));
  const count = Number(body.match(/<COUNT\s+Records="(\d+)"/i)?.[1] || 0);
  const cols = (body.match(/<COLUMNS>([\s\S]*?)<\/COLUMNS>/i)?.[1] || '').split(d);
  const rows = [...body.matchAll(/<DATA>([\s\S]*?)<\/DATA>/gi)].map((m) => {
    const vals = m[1].split(d);
    const o = {};
    cols.forEach((c, i) => { if (c) o[c] = decodeXml(vals[i] ?? ''); });
    return o;
  });
  return { count, rows, maxRows: /<MAXROWS\s*\/?>/i.test(body) };
}

const decodeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// ---------------------------------------------------------------------------
// Field mapping (RESO standard names; override per MLS with <ID>_FIELD_MAP)

const RESO = {
  listing_key: ['ListingKey', 'ListingKeyNumeric', 'L_ListingID', 'ListingID'],
  mls_number: ['ListingId', 'ListingID', 'L_DisplayId', 'MLSNumber'],
  status: ['StandardStatus', 'MlsStatus', 'L_Status', 'Status'],
  property_type: ['PropertyType', 'L_Type_', 'PropType'],
  property_sub_type: ['PropertySubType'],
  list_price: ['ListPrice', 'L_AskingPrice'],
  original_list_price: ['OriginalListPrice'],
  close_price: ['ClosePrice', 'L_SoldPrice', 'SoldPrice'],
  list_date: ['ListingContractDate', 'OnMarketDate', 'L_ListingDate'],
  close_date: ['CloseDate', 'L_ClosingDate'],
  pending_date: ['PurchaseContractDate', 'PendingTimestamp'],
  days_on_market: ['DaysOnMarket', 'CumulativeDaysOnMarket', 'L_DOM'],
  street_number: ['StreetNumber'],
  street_name: ['StreetName'],
  street_suffix: ['StreetSuffix'],
  street_dir_prefix: ['StreetDirPrefix'],
  unparsed_address: ['UnparsedAddress', 'L_Address'],
  unit: ['UnitNumber'],
  city: ['City', 'L_City'],
  state: ['StateOrProvince', 'L_State'],
  zip: ['PostalCode', 'L_Zip'],
  county: ['CountyOrParish'],
  latitude: ['Latitude'],
  longitude: ['Longitude'],
  beds: ['BedroomsTotal', 'LM_Int1_1'],
  baths_full: ['BathroomsFull'],
  baths_half: ['BathroomsHalf'],
  baths_total: ['BathroomsTotalInteger', 'BathroomsTotalDecimal', 'BathroomsTotal'],
  living_area: ['LivingArea', 'BuildingAreaTotal'],
  lot_size_acres: ['LotSizeAcres'],
  year_built: ['YearBuilt'],
  garage_spaces: ['GarageSpaces'],
  taxes: ['TaxAnnualAmount'],
  hoa_fee: ['AssociationFee'],
  list_agent_name: ['ListAgentFullName'],
  list_agent_email: ['ListAgentEmail'],
  list_agent_phone: ['ListAgentDirectPhone', 'ListAgentPreferredPhone'],
  list_office_name: ['ListOfficeName'],
  public_remarks: ['PublicRemarks', 'L_Remarks'],
  photo_count: ['PhotosCount', 'L_PictureCount'],
  modified_at: ['ModificationTimestamp', 'L_UpdateDate'],
};

const NUM = new Set(['list_price', 'original_list_price', 'close_price', 'baths_total', 'living_area', 'lot_size_acres', 'garage_spaces', 'taxes', 'hoa_fee', 'latitude', 'longitude']);
const INT = new Set(['days_on_market', 'beds', 'baths_full', 'baths_half', 'year_built', 'photo_count']);
const DATE = new Set(['list_date', 'close_date', 'pending_date']);

function toIso(v) {
  const s = String(v).trim().replace(' ', 'T');
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function mapListing(raw, cfg) {
  const pick = (k) => {
    const override = cfg.fieldMap?.[k];
    const names = override ? [override] : RESO[k] || [];
    for (const n of names) if (raw[n] != null && raw[n] !== '') return raw[n];
    return null;
  };
  const out = {};
  for (const k of Object.keys(RESO)) {
    let v = pick(k);
    if (v == null) continue;
    if (NUM.has(k)) v = Number(String(v).replace(/[^0-9.-]/g, '')) || null;
    else if (INT.has(k)) v = Number.parseInt(String(v).replace(/[^0-9-]/g, ''), 10);
    else if (DATE.has(k)) v = String(v).slice(0, 10);
    if (typeof v === 'number' && Number.isNaN(v)) continue;
    out[k] = v;
  }
  const street = out.unparsed_address
    || [out.street_number, out.street_dir_prefix, out.street_name, out.street_suffix].filter(Boolean).join(' ');
  if (!out.listing_key) return null;
  return {
    id: `${cfg.id}:${out.listing_key}`,
    source: cfg.id,
    feed_type: cfg.feed,
    listing_key: String(out.listing_key),
    mls_number: out.mls_number ? String(out.mls_number) : String(out.listing_key),
    status: out.status ?? null,
    property_type: out.property_type ?? null,
    property_sub_type: out.property_sub_type ?? null,
    list_price: out.list_price ?? null,
    original_list_price: out.original_list_price ?? null,
    close_price: out.close_price ?? null,
    list_date: out.list_date ?? null,
    close_date: out.close_date ?? null,
    pending_date: out.pending_date ?? null,
    days_on_market: out.days_on_market ?? null,
    street_address: street || null,
    unit: out.unit ?? null,
    city: out.city ?? null,
    state: out.state ?? null,
    zip: out.zip ? String(out.zip).slice(0, 10) : null,
    county: out.county ?? null,
    latitude: out.latitude ?? null,
    longitude: out.longitude ?? null,
    beds: out.beds ?? null,
    baths_full: out.baths_full ?? null,
    baths_half: out.baths_half ?? null,
    baths_total: out.baths_total ?? (out.baths_full != null ? out.baths_full + (out.baths_half || 0) * 0.5 : null),
    living_area: out.living_area ?? null,
    lot_size_acres: out.lot_size_acres ?? null,
    year_built: out.year_built ?? null,
    garage_spaces: out.garage_spaces ?? null,
    taxes: out.taxes ?? null,
    hoa_fee: out.hoa_fee ?? null,
    list_agent_name: out.list_agent_name ?? null,
    list_agent_email: out.list_agent_email ?? null,
    list_agent_phone: out.list_agent_phone ?? null,
    list_office_name: out.list_office_name ?? null,
    public_remarks: out.public_remarks ?? null,
    photo_count: out.photo_count ?? null,
    // RETS timestamps usually have no time zone. Read and write them the same way (as UTC)
    // so the sync cursor round-trips exactly, whatever zone the MLS server uses.
    modified_at: out.modified_at ? toIso(out.modified_at) : null,
    raw,
    synced_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Pull changes since the cursor, one batch per run (keeps each run under Vercel's limit).

const retsTime = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, '');

export async function pullBatch(cfg, since, offset = 1) {
  if (cfg.type === 'webapi') {
    if (!cfg.apiUrl || !cfg.token) throw new Error(`${cfg.id}: API_URL and TOKEN are required`);
    const u = new URL(`${cfg.apiUrl.replace(/\/$/, '')}/Property`);
    u.searchParams.set('$filter', `ModificationTimestamp gt ${new Date(since).toISOString()}`);
    u.searchParams.set('$orderby', 'ModificationTimestamp asc');
    u.searchParams.set('$top', String(cfg.batch));
    u.searchParams.set('$expand', 'Media($select=MediaURL,Order;$orderby=Order)');
    let res = await fetch(u, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' } });
    if (res.status === 400) {
      u.searchParams.delete('$expand'); // not every server supports Media expansion
      res = await fetch(u, { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' } });
    }
    if (!res.ok) throw new Error(`${cfg.id}: Web API ${res.status}`);
    const data = await res.json();
    const rows = (data.value || []).map((r) => {
      const row = mapListing(r, cfg);
      if (row && Array.isArray(r.Media)) row.photos = r.Media.map((m) => m.MediaURL).filter(Boolean).slice(0, 40);
      return row;
    }).filter(Boolean);
    return { rows, done: rows.length < cfg.batch, sorted: true };
  }

  if (!cfg.loginUrl || !cfg.username) throw new Error(`${cfg.id}: LOGIN_URL, USERNAME and PASSWORD are required`);
  const rets = new RetsClient(cfg);
  await rets.login();
  try {
    const field = cfg.standardNames ? 'ModificationTimestamp' : (cfg.fieldMap.modified_at || 'ModificationTimestamp');
    const query = `(${field}=${retsTime(since)}+)${cfg.query ? `,${cfg.query}` : ''}`;
    const { rows, count } = await rets.search({ query, limit: cfg.batch, offset });
    const mapped = rows.map((r) => mapListing(r, cfg)).filter(Boolean);
    // Photo links for a few listings per run (GetObject is slow).
    for (const row of mapped.slice(0, 15)) {
      if (row.photo_count !== 0) {
        const photos = await rets.photoUrls(row.listing_key);
        if (photos.length) row.photos = photos;
      }
    }
    const seen = offset - 1 + rows.length;
    return { rows: mapped, done: rows.length < cfg.batch || (count && seen >= count), sorted: false };
  } finally {
    await rets.logout();
  }
}
