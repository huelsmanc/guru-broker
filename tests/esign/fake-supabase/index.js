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
function newLogin(email, meta = {}) {
  const users = (globalThis.__authUsers ||= []);
  const e = String(email || '').toLowerCase();
  if (users.some((u) => u.email === e) || (db.profiles || []).some((p) => String(p.email).toLowerCase() === e)) {
    return { data: { user: null }, error: { message: 'A user with this email address has already been registered' } };
  }
  const user = { id: `au${++n}`, email: e };
  users.push(user);
  (db.profiles ||= []).push({ id: user.id, email: e, full_name: meta?.full_name || '', role: 'user', extra: {}, created_date: new Date().toISOString() });
  return { data: { user }, error: null };
}
export function createClient(url, key, clientOpts) {
  // Requests made with a user's token can be limited by simple per-table rules in tests:
  // globalThis.__rls = { transaction: (row, user) => boolean }
  const auth = clientOpts?.global?.headers?.Authorization || '';
  const viewer = auth.startsWith('Bearer ') ? globalThis.__users?.[auth.slice(7)] : null;
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
        const items = (Array.isArray(payload) ? payload : [payload]).map((p) => ({ id: p.id || `id${++n}`, created_date: new Date(Date.now() + n).toISOString(), updated_date: new Date(Date.now() + n).toISOString(), extra: {}, ...p }));
        rows.push(...items);
        return { data: single ? structuredClone(items[0]) : structuredClone(items), error: null };
      }
      let hit = rows.filter((r) => matches(r, ops));
      const rule = viewer && globalThis.__rls?.[table];
      if (rule) hit = hit.filter((r) => rule(r, viewer));
      if (action === 'update') { hit.forEach((r) => { Object.assign(r, payload); if (r.updated_date && !payload.updated_date) r.updated_date = new Date(Date.parse(r.updated_date) + 1 + Math.floor(Math.random() * 1000)).toISOString(); }); } // like the touch trigger
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
    rpc: async (name, args) => (name === 'deal_append' && !globalThis.__rpc?.[name] ? (() => {
      const t = (globalThis.__db.transaction || []).find((r) => r.id === args.p_id);
      if (!t) return { data: null, error: { message: 'Deal not found or not allowed' } };
      t[args.p_col] = [...(Array.isArray(t[args.p_col]) ? t[args.p_col] : []), args.p_item];
      return { data: null, error: null };
    })() : globalThis.__rpc?.[name] ? { data: await globalThis.__rpc[name](args), error: null } : { data: null, error: { message: `no function ${name}` } }),
    auth: { getUser: async (t) => (globalThis.__users?.[t] ? { data: { user: globalThis.__users[t] } } : { data: {}, error: { message: 'bad' } }), admin: {
      // Logins. Like the real database, creating one also creates the profile row (handle_new_user).
      createUser: async ({ email, user_metadata }) => newLogin(email, user_metadata),
      inviteUserByEmail: async (email, o = {}) => { (globalThis.__invites ||= []).push({ email, redirectTo: o.redirectTo }); return newLogin(email, o.data); },
      mfa: {
        listFactors: async ({ userId }) => ({ data: { factors: (globalThis.__factors?.[userId] || []).map((id) => ({ id, factor_type: 'totp', status: 'verified' })) }, error: null }),
        deleteFactor: async ({ id, userId }) => { const l = globalThis.__factors?.[userId] || []; globalThis.__factors[userId] = l.filter((x) => x !== id); return { data: { id }, error: null }; },
      },
      listUsers: async ({ page = 1, perPage = 50 } = {}) => ({ data: { users: (globalThis.__authUsers || []).slice((page - 1) * perPage, page * perPage) }, error: null }),
    } },
    storage: { from: (b) => ({
      upload: async (p, bytes) => { storage[`${b}/${p}`] = bytes; return { error: null }; },
      remove: async (ps) => { for (const p of ps) delete storage[`${b}/${p}`]; return { data: [], error: null }; },
      download: async (p) => ({ data: new Blob([storage[`${b}/${p}`] || '']) }),
      list: async (prefix) => ({ data: Object.keys(storage).filter((k) => k.startsWith(`${b}/${prefix}/`)).map((k) => ({ name: k.split('/').pop() })) }),
      createSignedUrls: async (ps) => ({ data: ps.map((p) => ({ path: p, signedUrl: storage[`${b}/${p}`] !== undefined ? `https://storage.test/${b}/${p}?sig=1` : null, error: storage[`${b}/${p}`] !== undefined ? null : 'Object not found' })), error: null }),
      createSignedUrl: async (p, secs, o) => (storage[`${b}/${p}`] !== undefined || b === 'private-files' && globalThis.__lenientSign ? { data: { signedUrl: `https://storage.test/${b}/${p}?sig=1${o?.download ? '&download=1' : ''}` }, error: null } : { data: null, error: { message: 'Object not found' } }),
      createSignedUploadUrl: async (p) => ({ data: { signedUrl: `https://storage.test/upload/${b}/${p}?token=t`, token: 't', path: p }, error: null }),
      getPublicUrl: (p) => ({ data: { publicUrl: `https://storage.test/${b}/${p}` } }),
    }) },
    channel: () => ({}),
  };
}
