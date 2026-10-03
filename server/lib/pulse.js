// Agent pulse: who might be drifting away, before they leave. Each agent gets a few plain-language
// signals and a level (steady / watch / at risk) from:
//   - how long since they last used Guru Broker,
//   - new deals now versus their usual pace,
//   - trainings left undone for a month, overdue onboarding items,
//   - activity on their Follow Up Boss leads (when connected).
// Admins can mark "checked in" (with a note), which keeps that agent out of alerts for 30 days.
import { adminClient } from './base44.js';
import { normalizeRole } from '../../shared/permissions.generated.js';
import { getConfig, fubFor } from './fub.js';

const DAY = 864e5;
const lc = (e) => String(e || '').toLowerCase().trim();
const daysSince = (d, now) => (d ? Math.floor((now - Date.parse(d)) / DAY) : null);
const PEOPLE = new Set(['agent', 'team_leader']);
export const CHECKIN_DAYS = 30;

const store = (bid) => `pulse:${bid}`;
export async function readPulse(bid) {
  const { data } = await adminClient().from('app_secret').select('value').eq('name', store(bid)).maybeSingle();
  return data?.value || { checkins: {} };
}
export async function writePulse(bid, value) {
  const { error } = await adminClient().from('app_secret').upsert({ name: store(bid), value }, { onConflict: 'name' });
  if (error) throw new Error(error.message);
}

/** Last sign-in per email from the login system (people stay signed in, so app activity is better when we have it). */
async function lastSignIns() {
  const out = new Map();
  for (let page = 1; page <= 10; page += 1) {
    const { data } = await adminClient().auth.admin.listUsers({ page, perPage: 1000 }).catch(() => ({ data: null }));
    const users = data?.users || [];
    for (const u of users) if (u.email && u.last_sign_in_at) out.set(lc(u.email), u.last_sign_in_at);
    if (users.length < 1000) break;
  }
  return out;
}

/** Signals and level for one brokerage's agents, most at risk first. */
export async function computePulse(bid, { now = Date.now() } = {}) {
  const db = adminClient();
  const { data: profiles } = await db.from('profiles').select('*').eq('brokerage_id', bid).limit(5000);
  const people = (profiles || []).map((p) => ({ ...(p.extra || {}), ...p }))
    .filter((p) => !p.suspended && p.role !== 'super_admin' && PEOPLE.has(normalizeRole(p.role)));
  if (!people.length) return [];

  const yearAgo = new Date(now - 365 * DAY).toISOString();
  const [{ data: deals }, { data: trainings }, { data: attempts }, { data: lists }, signIns, saved] = await Promise.all([
    db.from('transaction').select('agent_email, created_date, status').eq('brokerage_id', bid).gte('created_date', yearAgo).limit(20000),
    db.from('compliance_training').select('id, title, created_date').eq('brokerage_id', bid).limit(500),
    db.from('compliance_attempt').select('agent_email, training_id, passed').eq('brokerage_id', bid).eq('passed', true).limit(50000),
    db.from('checklist').select('subject_email, items').eq('brokerage_id', bid).eq('subject_type', 'onboarding').limit(5000),
    lastSignIns(),
    readPulse(bid),
  ]);

  // Follow Up Boss: the most recent activity on each matched agent's leads.
  const fubLast = new Map();
  const cfg = await getConfig(bid).catch(() => null);
  if (cfg?.api_key) {
    const call = fubFor(cfg);
    const byEmail = new Map(Object.entries(cfg.user_map || {}).filter(([, e]) => e).map(([id, e]) => [lc(e), id]));
    const todo = people.filter((p) => byEmail.has(lc(p.email)));
    for (let i = 0; i < todo.length; i += 5) {
      await Promise.all(todo.slice(i, i + 5).map(async (p) => {
        try {
          const r = await call(`/people?assignedUserId=${encodeURIComponent(byEmail.get(lc(p.email)))}&sort=-lastActivity&limit=1&fields=id,lastActivity`);
          fubLast.set(lc(p.email), { total: r?._metadata?.total ?? (r?.people?.length || 0), last: r?.people?.[0]?.lastActivity || null });
        } catch { /* skip this agent's lead check */ }
      }));
    }
  }

  const passed = new Set((attempts || []).map((a) => `${lc(a.agent_email)}|${a.training_id}`));
  const oldTrainings = (trainings || []).filter((t) => now - Date.parse(t.created_date) > 30 * DAY);
  const today = new Date(now).toISOString().slice(0, 10);

  const out = people.map((p) => {
    const email = lc(p.email);
    const signals = [];
    const add = (key, points, text) => signals.push({ key, points, text });
    const joined = p.start_date || p.created_date;
    const tenure = daysSince(joined, now) ?? 999;

    // Using the app
    const seen = [p.last_active_at, signIns.get(email)].filter(Boolean).sort().pop() || null;
    const idle = daysSince(seen, now);
    if (idle != null && idle >= 30) add('idle', 3, `Hasn't opened Guru Broker in ${idle} days`);
    else if (idle != null && idle >= 14) add('idle', 2, `Hasn't opened Guru Broker in ${idle} days`);

    // Deals versus their usual pace (not for agents in their first 90 days)
    const mine = (deals || []).filter((d) => lc(d.agent_email) === email);
    const recent = mine.filter((d) => now - Date.parse(d.created_date) <= 90 * DAY).length;
    const before = mine.length - recent; // the 9 months before that
    const lastDeal = mine.map((d) => d.created_date).sort().pop() || null;
    if (tenure > 90) {
      if (recent === 0 && before > 0) add('deals', 3, `No new deals in 90 days (${before} in the 9 months before)`);
      else if (before >= 4 && recent <= before / 3 / 2) add('deals', 2, `New deals down by half: ${recent} in the last 90 days, usually about ${Math.round(before / 3)}`);
      else if (recent === 0 && before === 0 && tenure > 120) add('deals', 1, 'No deals in the last year');
    }

    // Training and onboarding
    const undone = tenure > 30 ? oldTrainings.filter((t) => !passed.has(`${email}|${t.id}`)) : [];
    if (undone.length >= 3) add('training', 2, `${undone.length} trainings not finished after a month`);
    else if (undone.length) add('training', 1, `"${undone[0].title}"${undone.length > 1 ? ` and ${undone.length - 1} more` : ''} not finished after a month`);
    const overdue = (lists || []).filter((l) => lc(l.subject_email) === email).flatMap((l) => l.items || [])
      .filter((i) => i.due_date && i.due_date < today && !['approved', 'exempt', 'done'].includes(i.status));
    if (overdue.length) add('onboarding', 1, `${overdue.length} onboarding item${overdue.length === 1 ? '' : 's'} overdue`);

    // Follow Up Boss leads
    const f = fubLast.get(email);
    const fubIdle = f?.total ? daysSince(f.last, now) : null;
    if (fubIdle != null && fubIdle >= 30) add('fub', 2, `No activity on their Follow Up Boss leads in ${fubIdle} days`);
    else if (fubIdle != null && fubIdle >= 14) add('fub', 1, `No activity on their Follow Up Boss leads in ${fubIdle} days`);

    const score = signals.reduce((s, x) => s + x.points, 0);
    const level = score >= 5 ? 'at_risk' : score >= 3 ? 'watch' : 'steady';
    const checkin = saved.checkins?.[email] || null;
    const checkedIn = !!checkin && now - Date.parse(checkin.at) < CHECKIN_DAYS * DAY;
    return {
      email, name: p.display_name || p.full_name || email, photo: p.headshot || '', role: normalizeRole(p.role),
      score, level, signals: signals.sort((a, b) => b.points - a.points),
      last_active: seen, deals_90: recent, last_deal: lastDeal, fub_leads: f?.total ?? null, checkin, checked_in: checkedIn,
    };
  });
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
