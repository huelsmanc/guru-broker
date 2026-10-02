// New (super admin only): every user on the platform with their role, brokerage and last
// sign-in, plus every brokerage, so the platform owner can spot and fix role mistakes in one place.
//   { action: 'list' } -> { users, brokerages }
import { createClientFromRequest, adminClient } from '../lib/base44.js';

async function lastSignIns(db) {
  const out = new Map();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data?.users || []) out.set(u.id, { last_sign_in_at: u.last_sign_in_at || null, invited_at: u.invited_at || null, confirmed: !!(u.email_confirmed_at || u.confirmed_at) });
    if (!data?.users?.length || data.users.length < 1000) break;
  }
  return out;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (me.role !== 'super_admin') return Response.json({ error: 'Only the platform owner can see this.' }, { status: 403 });
    const db = adminClient();

    const [{ data: profiles, error: e1 }, { data: brokerages, error: e2 }, signIns] = await Promise.all([
      db.from('profiles').select('id, email, full_name, display_name, role, brokerage_id, suspended, created_date').order('created_date', { ascending: false }).limit(5000),
      db.from('brokerage').select('id, name, status, account_owner_id').order('name', { ascending: true }).limit(1000),
      lastSignIns(db).catch((e) => { console.error('platformUsers sign-ins', e.message); return new Map(); }),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const users = (profiles || []).map((p) => ({ ...p, ...(signIns.get(p.id) || {}) }));
    return Response.json({ users, brokerages: brokerages || [], me: me.id });
  } catch (error) {
    console.error('platformUsers:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
