// New: Follow Up Boss tells us right away when a person's stage changes. The link carries the
// brokerage and its own token; the body is signed with Guru Broker's system key. When someone
// reaches an "Under Contract" stage, their deal is opened (the 10-minute check is the backup).
import { createClient } from '../lib/base44.js';
import { getConfig, validSignature, fubFor, openDealFor, tcPicker, notifier, DEFAULTS } from '../lib/fub.js';

const lc = (e) => String(e || '').toLowerCase().trim();

export default async (req) => {
  const url = new URL(req.url);
  const raw = await req.text();
  const bid = url.searchParams.get('b') || '';
  const cfg = await getConfig(bid);
  if (!cfg?.api_key || !cfg.hook_token || url.searchParams.get('t') !== cfg.hook_token) return Response.json({ ok: true }); // unknown: ignore quietly
  if (!validSignature(raw, req.headers.get('fub-signature'))) return Response.json({ error: 'Bad signature' }, { status: 401 });
  let body = {};
  try { body = JSON.parse(raw); } catch { return Response.json({ ok: true }); }
  if (body.event !== 'peopleStageUpdated' || !Array.isArray(body.resourceIds) || !body.resourceIds.length) return Response.json({ ok: true });

  const E = createClient().asServiceRole.entities;
  const call = fubFor(cfg);
  const ids = body.resourceIds.slice(0, 20).map((x) => String(x).replace(/\D/g, '')).filter(Boolean);
  const data = await call(`/people?id=${ids.join(',')}&limit=20&fields=id,name,firstName,lastName,emails,phones,stage,source,tags,type,price,addresses,assignedUserId,assignedTo`).catch(() => null);
  const stages = (cfg.contract_stages || DEFAULTS.contract_stages).map(lc);
  let made = 0;
  for (const person of data?.people || []) {
    if (!stages.includes(lc(person.stage))) continue;
    const r = await openDealFor({
      E, cfg, brokerageId: bid, person, call,
      pickTc: tcPicker(E, bid), notify: notifier(E, bid),
    });
    if (r.tx && !r.skipped) made += 1;
  }
  return Response.json({ ok: true, made });
};
