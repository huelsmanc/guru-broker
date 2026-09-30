// Base44-compatible entity API on top of Supabase.
// Used by both the browser (src/api/base44Client.js) and the server (server/lib/base44.js)
// so pages and backend functions keep calling `base44.entities.X.filter(...)` unchanged.
//
// Record shape matches Base44: typed columns plus anything stored in `extra` are merged
// into one flat object. Fields the schema doesn't know about are saved into `extra`.

import { SCHEMA } from '../src/api/schema.generated.js';

const SYSTEM = new Set(['id', 'created_date', 'updated_date', 'created_by']);

function tableFor(entity) {
  const def = SCHEMA[entity];
  if (!def) throw new Error(`Unknown entity: ${entity}`);
  return def;
}

export function fromRow(row) {
  if (!row) return row;
  const { extra, ...rest } = row;
  return { ...(extra || {}), ...rest };
}

function split(def, data) {
  const cols = new Set(def.columns);
  const row = {};
  const extra = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined) continue;
    if (cols.has(k)) row[k] = v === '' && !SYSTEM.has(k) && isTypedNonText(def, k) ? null : v;
    else extra[k] = v;
  }
  return { row, extra };
}

// Empty strings from form inputs break numeric/date/bool/json columns; send null instead.
function isTypedNonText(def, k) {
  return (def.typed || []).includes(k);
}

function col(def, key) {
  return def.columns.includes(key) ? key : `extra->>${key}`;
}

function applySort(q, def, sort) {
  if (!sort) return q.order('created_date', { ascending: false });
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  return q.order(col(def, key), { ascending: !desc, nullsFirst: false });
}

function applyFilter(q, def, query) {
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined) continue;
    const c = col(def, key);
    const isExtra = c.startsWith('extra->>');
    if (value === null) q = q.is(c, null);
    else if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [op, v] of Object.entries(value)) {
        const val = isExtra && !Array.isArray(v) ? String(v) : v;
        if (op === '$in') q = q.in(c, isExtra ? v.map(String) : v);
        else if (op === '$nin') q = q.not(c, 'in', `(${v.map((x) => JSON.stringify(x)).join(',')})`);
        else if (op === '$ne') q = q.neq(c, val);
        else if (op === '$gt') q = q.gt(c, val);
        else if (op === '$gte') q = q.gte(c, val);
        else if (op === '$lt') q = q.lt(c, val);
        else if (op === '$lte') q = q.lte(c, val);
        else throw new Error(`Unsupported filter operator ${op}`);
      }
    } else if (Array.isArray(value)) {
      q = q.contains(c, value);
    } else {
      q = q.eq(c, isExtra ? String(value) : value);
    }
  }
  return q;
}

function check({ data, error }) {
  if (error) {
    const e = new Error(error.message);
    e.status = error.code === 'PGRST116' ? 404 : 400;
    e.details = error;
    throw e;
  }
  return data;
}

export function makeEntity(entity, getClient, { getEmail } = {}) {
  const def = tableFor(entity);
  const t = def.table;
  const sb = () => getClient();

  const api = {
    async list(sort, limit = 50, skip = 0) {
      return api.filter({}, sort, limit, skip);
    },
    async filter(query = {}, sort, limit = 50, skip = 0) {
      let q = sb().from(t).select('*');
      q = applyFilter(q, def, query);
      q = applySort(q, def, sort);
      if (limit) q = q.range(skip || 0, (skip || 0) + limit - 1);
      return check(await q).map(fromRow);
    },
    async get(id) {
      return fromRow(check(await sb().from(t).select('*').eq('id', id).single()));
    },
    async create(data) {
      const { row, extra } = split(def, data);
      if (entity !== 'User' && !row.created_by && getEmail) row.created_by = (await getEmail()) || null;
      delete row.id; delete row.created_date; delete row.updated_date;
      if (data?.id) row.id = data.id; // keep imported ids
      return fromRow(check(await sb().from(t).insert({ ...row, extra }).select('*').single()));
    },
    async bulkCreate(items) {
      const email = getEmail ? await getEmail() : null;
      const rows = items.map((d) => {
        const { row, extra } = split(def, d);
        if (entity !== 'User' && !row.created_by) row.created_by = email;
        return { ...row, extra };
      });
      return check(await sb().from(t).insert(rows).select('*')).map(fromRow);
    },
    async update(id, data) {
      const { row, extra } = split(def, data);
      delete row.id; delete row.created_date; delete row.updated_date; delete row.created_by;
      if (Object.keys(extra).length) {
        const cur = check(await sb().from(t).select('extra').eq('id', id).single());
        row.extra = { ...(cur.extra || {}), ...extra };
      }
      return fromRow(check(await sb().from(t).update(row).eq('id', id).select('*').single()));
    },
    async delete(id) {
      check(await sb().from(t).delete().eq('id', id));
      return { id };
    },
    // Base44 passes { type: 'create' | 'update' | 'delete', id, data } to the callback.
    subscribe(callback) {
      const client = sb();
      const channel = client
        .channel(`rt-${t}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: t }, (payload) => {
          const type = { INSERT: 'create', UPDATE: 'update', DELETE: 'delete' }[payload.eventType];
          const rec = payload.eventType === 'DELETE' ? payload.old : payload.new;
          callback({ type, id: rec?.id, data: fromRow(rec) });
        })
        .subscribe();
      return () => { client.removeChannel(channel); };
    },
  };
  return api;
}

export function makeEntities(getClient, opts) {
  const cache = {};
  return new Proxy({}, {
    get(_, name) {
      if (typeof name !== 'string') return undefined;
      return (cache[name] ||= makeEntity(name, getClient, opts));
    },
  });
}
