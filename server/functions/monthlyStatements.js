// Scheduled on the 1st (and runnable by admins for any month): builds each agent's
// commission statement PDF for the month, stores it, and emails it to them.
import { createClientFromRequest, adminClient, appUrl } from '../lib/base44.js';
import { isServiceRequest } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';
import { SendEmail } from '../lib/integrations.js';
import { createDoc, money } from '../lib/pdfdoc.js';
import { agentContext } from '../lib/backoffice.js';
import { esc } from '../lib/esign.js';

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10), label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}

export async function buildStatement(entities, email, ym, brokerageId) {
  const { from, to, label } = monthRange(ym);
  const recs = (await entities.CommissionRecord.filter({ agent_email: email, status: { $in: ['approved', 'paid'] }, closed_date: { $gte: from, $lt: to } }, 'closed_date', 500));
  const payouts = await entities.Payout.filter({ payee_email: email, created_date: { $gte: from, $lt: to } }, 'created_date', 500);
  const ctx = await agentContext(entities, email, { brokerageId, on: new Date(`${to}T00:00:00Z`) });
  const [settings] = await entities.BrokerageSettings.filter({ brokerage_id: brokerageId }, '-created_date', 1);
  const doc = await createDoc();
  doc.title(`Commission statement - ${label}`, `${ctx.name} <${email}> | ${settings?.brokerage_name || 'Guru Broker'} | Plan: ${ctx.plan.name}`);
  doc.heading('Closed deals');
  if (!recs.length) doc.text('No deals closed this month.');
  const cols = (a, b, c, d, e) => [{ text: a, width: 70 }, { text: b, width: 190 }, { text: c, width: 84, align: 'right' }, { text: d, width: 84, align: 'right' }, { text: e, width: 84, align: 'right' }];
  if (recs.length) doc.row(cols('Closed', 'Property', 'Your share', 'Brokerage', 'Your net'), { isBold: true });
  let net = 0; let gci = 0; let cd = 0;
  for (const r of recs) {
    doc.row(cols(r.closed_date, r.property_address || '', money(r.gross_share), money(r.company_dollar), money(r.agent_net)));
    net += Number(r.agent_net) || 0; gci += Number(r.gross_share) || 0; cd += Number(r.company_dollar) || 0;
    for (const l of r.calc?.agent?.lines || []) if (!l.total) doc.row([{ text: '', width: 70 }, { text: `  ${l.label}`, width: 358 }, { text: money(l.amount), width: 84, align: 'right' }], { size: 8 });
  }
  if (recs.length) { doc.rule(); doc.row(cols('', 'Month total', money(gci), money(cd), money(net)), { isBold: true }); }
  const other = payouts.filter((p) => p.kind !== 'agent' && p.status !== 'void');
  if (other.length) {
    doc.heading('Team, revenue share and other payments to you');
    for (const p of other) doc.row([{ text: p.created_date?.slice(0, 10), width: 70 }, { text: p.memo || p.kind, width: 358 }, { text: money(p.amount), width: 84, align: 'right' }]);
  }
  doc.heading('Cap year');
  doc.text(`Cap year started ${ctx.cap_year_start}. Year to date: GCI ${money(ctx.ytd.gci)}, paid to brokerage ${money(ctx.ytd.company_dollar)}.`);
  const cap = ctx.plan.config?.cap?.amount;
  if (cap) doc.text(`Cap ${money(cap)}: ${ctx.ytd.company_dollar >= cap ? 'reached' : `${money(cap - ctx.ytd.company_dollar)} to go`}.`);
  const bytes = await doc.save();
  return { bytes, label, count: recs.length, net };
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const service = isServiceRequest(req);
    let me = null;
    if (!service) {
      me = await base44.auth.me();
      if (!can(me, 'accounting.access')) return Response.json({ error: 'Admins only' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const ym = body.month || prev.toISOString().slice(0, 7);
    const entities = base44.asServiceRole.entities;
    let people = await entities.User.list('-created_date', 5000);
    if (me) people = people.filter((u) => u.brokerage_id === me.brokerage_id);
    if (body.email) people = people.filter((u) => u.email === String(body.email).toLowerCase());
    let sent = 0;
    for (const u of people) {
      if (u.suspended || !u.brokerage_id) continue;
      const { bytes, label, count } = await buildStatement(entities, u.email, ym, u.brokerage_id);
      if (!count && !body.email) continue; // nothing closed: no statement
      const path = `statements/${u.email}/${ym}.pdf`;
      await adminClient().storage.from('private-files').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
      if (body.send !== false) {
        await SendEmail({
          to: u.email,
          subject: `Your commission statement - ${label}`,
          from_name: 'Guru Broker',
          attachments: [{ filename: `Commission statement ${ym}.pdf`, content: Buffer.from(bytes).toString('base64') }],
          body: `<div style="font-family:Arial,sans-serif;line-height:1.55"><p>Hi ${esc(u.full_name || '')},</p><p>Your commission statement for ${esc(label)} is attached. You can also see every deal and payout under <a href="${appUrl()}/MyCommissions">My Commissions</a>.</p></div>`,
        }).catch((e) => console.error('statement email', u.email, e.message));
      }
      sent++;
    }
    return Response.json({ status: 'ok', month: ym, statements: sent });
  } catch (error) {
    console.error('monthlyStatements:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
