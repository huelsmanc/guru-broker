// New: Follow Up Boss connection (the brokerage's shared account, e.g. a Zillow Flex team).
// Admins (Settings → Integrations):
//   status · connect { api_key } · settings { contract_stages, closed_stage, flex_sources, flex_pct, user_map }
//   · sync (check now) · disconnect
// On a deal (anyone who can see it): deal { transaction_id } → the linked person and recent activity
//   · search { q } · link { transaction_id, person_id } · unlink { transaction_id }
// The system: { poll: true } every 10 minutes (people now in an "Under Contract" stage get a deal)
//   · { event } when a deal's status changes (a closing is written back to Follow Up Boss).
import { createClientFromRequest, isServiceRequest, appUrl } from '../lib/base44.js';
import crypto from 'node:crypto';
import { isAdminRole } from '../lib/team.js';
import {
  DEFAULTS, getConfig, saveConfig, removeConfig, connectedBrokerages, sealKey, fub, fubFor, systemReady,
  personSummary, openDealFor, writeClosing, personUrl, tcPicker, notifier, personWithActivity, PERSON_FIELDS,
} from '../lib/fub.js';

class Problem extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const lc = (e) => String(e || '').toLowerCase().trim();
const clip = (v, n) => String(v ?? '').slice(0, n);
const list = (v) => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map((x) => clip(x, 80).trim()).filter(Boolean))].slice(0, 10);

/** Checks one brokerage: everyone currently in an "Under Contract" stage has a deal. */
async function checkBrokerage(E, brokerageId, cfg) {
  const call = fubFor(cfg);
  const made = []; const unmatched = [];
  for (const stage of (cfg.contract_stages || DEFAULTS.contract_stages).slice(0, 4)) {
    const data = await call(`/people?stage=${encodeURIComponent(stage)}&sort=-updated&limit=50&fields=id,name,firstName,lastName,emails,phones,stage,source,tags,type,price,addresses,assignedUserId,assignedTo`);
    for (const person of data?.people || []) {
      const r = await openDealFor({ E, cfg, brokerageId, person, call, pickTc: tcPicker(E, brokerageId), notify: notifier(E, brokerageId) });
      if (r.tx && !r.skipped) made.push(r.tx.id);
      if (r.skipped === 'agent not matched' || r.skipped === 'agent not in brokerage') unmatched.push({ ...r.person, reason: r.skipped });
    }
  }
  await saveConfig(brokerageId, { ...cfg, last_sync: new Date().toISOString(), last_error: null, unmatched: unmatched.slice(0, 50) });
  return { made: made.length, unmatched: unmatched.length };
}

const publicStatus = (cfg) => cfg && ({
  connected: !!cfg.api_key, account: cfg.account || null, connected_by: cfg.connected_by || null, connected_at: cfg.connected_at || null,
  contract_stages: cfg.contract_stages, closed_stage: cfg.closed_stage, flex_sources: cfg.flex_sources, flex_pct: cfg.flex_pct,
  stages: cfg.stages || [], users: cfg.users || [], user_map: cfg.user_map || {}, unmatched: cfg.unmatched || [],
  last_sync: cfg.last_sync || null, last_error: cfg.last_error || null, webhook: !!cfg.webhook_ids?.length,
});

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const E = base44.asServiceRole.entities;

    // ------------------------------------------------------------ the system
    if (body.poll || body.event) {
      if (!isServiceRequest(req)) return Response.json({ error: 'Not available' }, { status: 403 });
      if (!systemReady()) return Response.json({ skipped: 'not set up' });
      if (body.poll) {
        const out = {};
        for (const { brokerageId, cfg } of await connectedBrokerages()) {
          try { out[brokerageId] = await checkBrokerage(E, brokerageId, cfg); } catch (e) {
            out[brokerageId] = { error: e.message };
            await saveConfig(brokerageId, { ...cfg, last_error: e.message, last_error_at: new Date().toISOString() }).catch(() => {});
          }
        }
        return Response.json(out);
      }
      const { type, data: tx, old_data: old } = body.event;
      if (type !== 'update' || tx?.status !== 'closed' || old?.status === 'closed' || !tx.fub_person_id) return Response.json({ skipped: true });
      const cfg = await getConfig(tx.brokerage_id);
      if (!cfg?.api_key) return Response.json({ skipped: 'not connected' });
      return Response.json(await writeClosing({ call: fubFor(cfg), cfg, tx }));
    }

    // ------------------------------------------------------------ people
    const me = await base44.auth.me();
    const admin = isAdminRole(me.role) || me.role === 'super_admin';
    const bid = me.brokerage_id;
    if (!bid) throw new Problem('Join a brokerage first.', 403);
    const needAdmin = () => { if (!admin) throw new Problem('Only brokerage admins can change the Follow Up Boss connection.', 403); };
    let cfg = await getConfig(bid);

    switch (body.action) {
      case 'status':
        needAdmin();
        return Response.json({ system_ready: systemReady(), ...(publicStatus(cfg) || { connected: false }) });

      case 'connect': {
        needAdmin();
        const key = clip(body.api_key, 200).trim();
        if (!key) throw new Problem('Paste the API key from Follow Up Boss (Admin → API).');
        const who = await fub(key, '/me');
        const users = (await fub(key, '/users?limit=100&fields=id,name,email,role'))?.users || [];
        const stages = ((await fub(key, '/stages?limit=100'))?.stages || []).map((s) => s.name).filter(Boolean);
        const people = await E.User.filter({ brokerage_id: bid }, 'full_name', 2000);
        const emails = new Set(people.map((p) => lc(p.email)));
        const user_map = {};
        for (const u of users) if (emails.has(lc(u.email))) user_map[String(u.id)] = lc(u.email);
        cfg = {
          ...DEFAULTS, ...(cfg || {}), api_key: sealKey(key),
          account: { name: who?.name || who?.firstName || '', email: lc(who?.email), role: who?.role || '' },
          connected_by: lc(me.email), connected_at: new Date().toISOString(),
          users: users.map((u) => ({ id: String(u.id), name: u.name, email: lc(u.email), role: u.role })),
          stages, user_map: { ...(cfg?.user_map || {}), ...user_map },
          contract_stages: (cfg?.contract_stages || DEFAULTS.contract_stages).filter((s) => !stages.length || stages.includes(s)),
        };
        if (!cfg.contract_stages.length) cfg.contract_stages = stages.filter((s) => /contract|pending/i.test(s)).slice(0, 2);
        if (stages.length && !stages.includes(cfg.closed_stage)) cfg.closed_stage = stages.find((s) => /closed/i.test(s)) || cfg.closed_stage;
        // Instant updates when a stage changes (the account owner's key is needed for this).
        if (/owner/i.test(cfg.account.role)) {
          const token = cfg.hook_token || crypto.randomBytes(18).toString('hex');
          try {
            const hook = await fub(key, '/webhooks', { method: 'POST', body: { event: 'peopleStageUpdated', url: `${appUrl()}/api/fn/fubWebhook?b=${encodeURIComponent(bid)}&t=${encodeURIComponent(token)}` } });
            cfg.hook_token = token;
            cfg.webhook_ids = [...new Set([...(cfg.webhook_ids || []), hook?.id].filter(Boolean))];
          } catch (e) { cfg.webhook_error = e.message; }
        }
        await saveConfig(bid, cfg);
        return Response.json({ system_ready: true, ...publicStatus(cfg) });
      }

      case 'settings': {
        needAdmin();
        if (!cfg?.api_key) throw new Problem('Connect Follow Up Boss first.');
        const pct = Number(body.flex_pct);
        const userMap = {};
        const known = new Set((cfg.users || []).map((u) => u.id));
        for (const [id, email] of Object.entries(body.user_map || {})) if (known.has(String(id)) && email) userMap[String(id)] = lc(email);
        cfg = {
          ...cfg,
          contract_stages: body.contract_stages ? list(body.contract_stages) : cfg.contract_stages,
          closed_stage: body.closed_stage ? clip(body.closed_stage, 80) : cfg.closed_stage,
          flex_sources: body.flex_sources ? list(body.flex_sources) : cfg.flex_sources,
          flex_pct: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : cfg.flex_pct,
          user_map: body.user_map ? userMap : cfg.user_map,
        };
        await saveConfig(bid, cfg);
        return Response.json({ system_ready: systemReady(), ...publicStatus(cfg) });
      }

      case 'sync': {
        needAdmin();
        if (!cfg?.api_key) throw new Problem('Connect Follow Up Boss first.');
        const r = await checkBrokerage(E, bid, cfg);
        return Response.json({ ...r, ...publicStatus(await getConfig(bid)) });
      }

      case 'disconnect': {
        needAdmin();
        if (cfg?.api_key) {
          const call = fubFor(cfg);
          for (const id of cfg.webhook_ids || []) await call(`/webhooks/${id}`, { method: 'DELETE' }).catch(() => {});
        }
        await removeConfig(bid);
        return Response.json({ connected: false, system_ready: systemReady() });
      }

      // -------------------------------------------------------- My Leads
      // Agents see the Follow Up Boss people assigned to them; admins see everyone's.
      case 'me': {
        const mine = Object.entries(cfg?.user_map || {}).find(([, e]) => e === lc(me.email))?.[0] || null;
        return Response.json({ connected: !!cfg?.api_key, matched: !!mine, admin, stages: cfg?.stages || [] });
      }
      case 'leads': case 'lead': case 'note': case 'stage': {
        if (!cfg?.api_key) throw new Problem('Follow Up Boss isn\'t connected. An admin can connect it in Settings → Integrations.');
        const call = fubFor(cfg);
        const mine = Object.entries(cfg.user_map || {}).find(([, e]) => e === lc(me.email))?.[0] || null;
        if (!admin && !mine) throw new Problem('Your Follow Up Boss user isn\'t matched to you yet. Ask an admin to match it in Settings → Integrations.', 403);
        const owns = (p) => admin || String(p?.assignedUserId ?? '') === String(mine);

        if (body.action === 'leads') {
          const params = new URLSearchParams({ limit: '50', offset: String(Math.max(0, Number(body.offset) || 0)), sort: '-lastActivity', fields: PERSON_FIELDS });
          const who = admin ? clip(body.agent_id, 20).replace(/\D/g, '') : mine;
          if (who) params.set('assignedUserId', who);
          if (body.stage) params.set('stage', clip(body.stage, 80));
          const q = clip(body.q, 80).trim();
          if (q) params.set(/@/.test(q) ? 'email' : /^[\d\s()+-]{7,}$/.test(q) ? 'phone' : 'name', q);
          let data;
          try { data = await call(`/people?${params}`); } catch (e) {
            if (e.fubStatus !== 400) throw e;
            params.set('sort', '-updated'); // older accounts: sort by last update instead
            data = await call(`/people?${params}`);
          }
          const agents = admin ? (cfg.users || []).map((u) => ({ id: u.id, name: u.name })) : [];
          return Response.json({ people: (data?.people || []).map(personSummary), total: data?._metadata?.total ?? null, stages: cfg.stages || [], agents, admin });
        }

        const id = clip(body.person_id, 20).replace(/\D/g, '');
        if (!id) throw new Problem('Pick a lead.');
        if (body.action === 'lead') {
          const { p, activity, hidden } = await personWithActivity(call, id, 25);
          if (!p || !owns(p)) throw new Problem('Lead not found', 404);
          const deals = await E.Transaction.filter({ brokerage_id: bid, fub_person_id: String(p.id) }, '-created_date', 3).catch(() => []);
          return Response.json({ person: personSummary(p), activity, hidden, stages: cfg.stages || [], deals: deals.map((d) => ({ id: d.id, address: d.property_address, status: d.status })) });
        }
        const p = await call(`/people/${id}?fields=${PERSON_FIELDS}`).catch(() => null);
        if (!p || !owns(p)) throw new Problem('Lead not found', 404);
        if (body.action === 'note') {
          const text = clip(body.text, 4000).trim();
          if (!text) throw new Problem('Write a note first.');
          await call('/notes', { method: 'POST', body: { personId: Number(id), subject: `Note from ${me.display_name || me.full_name || me.email} (Guru Broker)`, body: text, isHtml: false } });
          return Response.json({ ok: true });
        }
        // Stage change: reaching an "Under Contract" stage opens the deal here right away.
        const stage = clip(body.stage, 80);
        if (!(cfg.stages || []).includes(stage)) throw new Problem('Pick one of your Follow Up Boss stages.');
        const updated = await call(`/people/${id}`, { method: 'PUT', body: { stage } });
        let deal = null;
        if ((cfg.contract_stages || DEFAULTS.contract_stages).map(lc).includes(lc(stage))) {
          const r = await openDealFor({ E, cfg, brokerageId: bid, person: { ...p, ...updated, stage }, call, pickTc: tcPicker(E, bid), notify: notifier(E, bid) });
          deal = r.tx ? { id: r.tx.id, address: r.tx.property_address, opened: !r.skipped } : null;
        }
        return Response.json({ ok: true, stage, deal });
      }

      // -------------------------------------------------------- on a deal
      case 'deal': case 'link': case 'unlink': case 'search': {
        if (!cfg?.api_key) return Response.json({ connected: false });
        const call = fubFor(cfg);
        if (body.action === 'search') {
          const q = clip(body.q, 80).trim();
          if (q.length < 2) return Response.json({ people: [] });
          const by = /@/.test(q) ? 'email' : /^[\d\s()+-]{7,}$/.test(q) ? 'phone' : 'name';
          const mineOnly = admin ? '' : (() => { const id = Object.entries(cfg.user_map || {}).find(([, e]) => e === lc(me.email))?.[0]; return id ? `&assignedUserId=${id}` : null; })();
          if (mineOnly === null) return Response.json({ people: [], note: 'Your Follow Up Boss user isn\'t matched to you yet. Ask an admin (Settings → Integrations).' });
          const data = await call(`/people?${by}=${encodeURIComponent(q)}&limit=10&fields=id,name,firstName,lastName,emails,phones,stage,source,assignedTo${mineOnly}`);
          return Response.json({ people: (data?.people || []).map(personSummary) });
        }
        // The deal, with the person's own access rules.
        const tx = await base44.entities.Transaction.get(String(body.transaction_id || '')).catch(() => null);
        if (!tx) throw new Problem('Deal not found', 404);
        if (body.action === 'link') {
          const pid = clip(body.person_id, 20).replace(/\D/g, '');
          if (!pid) throw new Problem('Pick a Follow Up Boss contact.');
          const p = await call(`/people/${pid}?fields=id,name,firstName,lastName,emails,phones,stage,source,assignedUserId,assignedTo`);
          await base44.entities.Transaction.update(tx.id, { fub_person_id: String(p.id) }); // your own edit rights apply
          await call('/notes', { method: 'POST', body: { personId: Number(p.id), subject: 'Linked to Guru Broker', body: `Deal: ${tx.property_address || ''} (${appUrl()}/Transactions/${tx.id})`, isHtml: false } }).catch(() => {});
          return Response.json({ connected: true, person: personSummary(p), activity: [] });
        }
        if (body.action === 'unlink') {
          await base44.entities.Transaction.update(tx.id, { fub_person_id: null });
          return Response.json({ connected: true, person: null });
        }
        if (!tx.fub_person_id) return Response.json({ connected: true, person: null });
        const { p, activity, hidden } = await personWithActivity(call, tx.fub_person_id);
        return Response.json({ connected: true, person: p ? personSummary(p) : { id: tx.fub_person_id, name: 'Follow Up Boss contact', url: personUrl(tx.fub_person_id) }, activity, hidden });
      }

      default:
        throw new Problem('Unknown action');
    }
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('fub:', error);
    return Response.json({ error: error.message || 'Something went wrong' }, { status });
  }
};
