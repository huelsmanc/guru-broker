// Agent pulse (see server/lib/pulse.js).
//   ping                         -> anyone: "I'm using the app today" (once a day from the app)
//   list { refresh? }            -> admins: every agent's signals (kept for 6 hours unless refreshed)
//   check_in { email, note? }    -> admins: talked to them; out of alerts for 30 days
//   { scan: true }               -> the weekly job: refresh every brokerage and alert its admins
import { createClientFromRequest, isServiceRequest, adminClient } from '../lib/base44.js';
import { isAdminRole, can, notifyPeople } from '../lib/team.js';
import { computePulse, readPulse, writePulse } from '../lib/pulse.js';

class Problem extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const lc = (e) => String(e || '').toLowerCase().trim();
const FRESH_MS = 6 * 3600e3;

async function refresh(bid) {
  const agents = await computePulse(bid);
  const saved = await readPulse(bid);
  const value = { ...saved, computed_at: new Date().toISOString(), agents };
  await writePulse(bid, value);
  return value;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    if (body.scan) {
      if (!isServiceRequest(req)) throw new Problem('Not available', 403);
      const db = adminClient();
      const { data: rows } = await db.from('brokerage').select('id').limit(1000);
      let alerted = 0;
      for (const { id } of rows || []) {
        try {
          const { agents } = await refresh(id);
          const drifting = agents.filter((a) => a.level !== 'steady' && !a.checked_in);
          if (!drifting.length) continue;
          const { data: admins } = await db.from('profiles').select('email, full_name, display_name, role, suspended').eq('brokerage_id', id).limit(500);
          const to = (admins || []).filter((u) => !u.suspended && isAdminRole(u.role) && u.role !== 'super_admin');
          const atRisk = drifting.filter((a) => a.level === 'at_risk');
          const names = drifting.slice(0, 3).map((a) => String(a.name).split(' ')[0]).join(', ');
          await notifyPeople(base44.asServiceRole.entities, {
            brokerageId: id, people: to,
            title: `Agent pulse: ${drifting.length} agent${drifting.length === 1 ? '' : 's'} may be drifting`,
            message: `${names}${drifting.length > 3 ? ` and ${drifting.length - 3} more` : ''}.${atRisk.length ? ` ${atRisk.length} at risk.` : ''} A quick check-in goes a long way.`,
            link: '/AgentPulse', referenceType: 'Pulse', email: false,
          });
          alerted += 1;
        } catch (e) { console.error('agent pulse scan', id, e.message); }
      }
      return Response.json({ alerted });
    }

    const me = await base44.auth.me().catch(() => null);
    if (!me) throw new Problem('Not signed in', 401);

    if (body.action === 'ping') {
      // Once a day is enough; saved as the app (agents can't set it for each other).
      const today = new Date().toISOString().slice(0, 10);
      if (String(me.last_active_at || '').slice(0, 10) !== today) {
        await base44.asServiceRole.entities.User.update(me.id, { last_active_at: new Date().toISOString() }).catch(() => {});
      }
      return Response.json({ ok: true });
    }

    if (!isAdminRole(me.role) && !can(me, 'users.manage')) throw new Problem('Admins only', 403);
    const bid = me.brokerage_id;

    if (body.action === 'list') {
      let v = await readPulse(bid);
      if (body.refresh || !v.computed_at || Date.now() - Date.parse(v.computed_at) > FRESH_MS) v = await refresh(bid);
      return Response.json({ computed_at: v.computed_at, agents: v.agents || [] });
    }

    if (body.action === 'check_in') {
      const email = lc(body.email);
      if (!email) throw new Problem('Pick an agent');
      const v = await readPulse(bid);
      const checkin = { at: new Date().toISOString(), by: lc(me.email), by_name: me.display_name || me.full_name || me.email, note: String(body.note || '').trim().slice(0, 500) };
      const agents = (v.agents || []).map((a) => (a.email === email ? { ...a, checkin, checked_in: true } : a));
      await writePulse(bid, { ...v, checkins: { ...(v.checkins || {}), [email]: checkin }, agents });
      return Response.json({ checkin });
    }

    throw new Problem('Unknown action');
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('agentPulse:', e);
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
};
