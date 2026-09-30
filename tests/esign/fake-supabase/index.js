// In-memory stand-in for supabase-js, enough for server tests.
const db = globalThis.__db ||= {};
const storage = globalThis.__storage ||= {};
let n = 0;
function matches(row, ops) {
  for (const [op, col, val] of ops) {
    const get = (c) => c.startsWith('extra->>') ? (row.extra || {})[c.slice(8)] : row[c];
    if (op === 'eq' && String(get(col)) !== String(val)) return false;
    if (op === 'gte' && !(get(col) >= val)) return false;
    if (op === 'lte' && !(get(col) <= val)) return false;
    if (op === 'neq' && String(get(col)) === String(val)) return false;
    if (op === 'lt' && !(get(col) < val)) return false;
    if (op === 'gt' && !(get(col) > val)) return false;
    if (op === 'is' && get(col) != null) return false;
    if (op === 'in' && !val.map(String).includes(String(get(col)))) return false;
    if (op === 'contains') {
      const want = JSON.parse(val); const have = get(col) || [];
      if (!want.every((w) => have.some((h) => Object.entries(w).every(([k, v]) => h[k] === v)))) return false;
    }
  }
  return true;
}
export function createClient(url, key, opts) {
  const from = (table) => {
    const ops = []; let action = 'select', payload = null, single = false, opts = null;
    const run = () => {
      const rows = (db[table] ||= []);
      if (action === 'upsert') {
        const key = opts?.onConflict || 'id';
        for (const p of (Array.isArray(payload) ? payload : [payload])) {
          const hit = rows.find((r) => r[key] === p[key]);
          if (hit) Object.assign(hit, p); else rows.push({ ...p });
        }
        return { data: null, error: null };
      }
      if (action === 'insert') {
        const items = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: p.id || `id${++n}`, created_date: new Date(Date.now() + n).toISOString(), extra: {}, ...p }));
        rows.push(...items);
        return { data: single ? structuredClone(items[0]) : structuredClone(items), error: null };
      }
      let hit = rows.filter((r) => matches(r, ops));
      if (action === 'update') { hit.forEach((r) => Object.assign(r, payload)); }
      if (action === 'delete') { db[table] = rows.filter((r) => !hit.includes(r)); }
      const order = ops.find((o) => o[0] === 'order');
      if (order) { const [, c, o] = order; hit = [...hit].sort((a, b) => (a[c] > b[c] ? 1 : -1) * (o?.ascending === false ? -1 : 1)); }
      const range = ops.find((o) => o[0] === 'range'); if (range) hit = hit.slice(range[1], range[2] + 1);
      if (action === 'update' && !single) return { data: structuredClone(hit), error: null };
      if (single) return hit[0] ? { data: structuredClone(hit[0]), error: null } : { data: null, error: { code: 'PGRST116', message: 'not found' } };
      return { data: structuredClone(hit), error: null };
    };
    const chain = new Proxy({}, { get(_, op) {
      if (op === 'then') return (res, rej) => Promise.resolve(run()).then(res, rej);
      return (...a) => {
        if (op === 'insert' || op === 'update' || op === 'delete' || op === 'upsert') { action = op; payload = a[0]; opts = a[1]; }
        else if (op === 'single' || op === 'maybeSingle') single = true;
        else if (op !== 'select') ops.push([op, ...a]);
        return chain;
      };
    } });
    return chain;
  };
  return {
    from,
    auth: { getUser: async (t) => (globalThis.__users?.[t] ? { data: { user: globalThis.__users[t] } } : { data: {}, error: { message: 'bad' } }), admin: {} },
    storage: { from: (b) => ({
      upload: async (p, bytes) => { storage[`${b}/${p}`] = bytes; return { error: null }; },
      download: async (p) => ({ data: new Blob([storage[`${b}/${p}`] || '']) }),
      list: async (prefix) => ({ data: Object.keys(storage).filter((k) => k.startsWith(`${b}/${prefix}/`)).map((k) => ({ name: k.split('/').pop() })) }),
      createSignedUrl: async (p) => ({ data: { signedUrl: `https://storage.test/${b}/${p}?sig=1` }, error: null }),
      getPublicUrl: (p) => ({ data: { publicUrl: `https://storage.test/${b}/${p}` } }),
    }) },
    channel: () => ({}),
  };
}
