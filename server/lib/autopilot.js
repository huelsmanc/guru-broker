// Deal autopilot, the sending side (the plan is in shared/autopilot.js). Runs every hour:
//   - at 8am (brokerage time) sends the day's deadline reminders: the deal team in the app, on their
//     phone and by email; other parties by a short branded email from the agent (replies go to the agent);
//   - at 7am (each person's own time zone) sends everyone on a deal team their "due today" list.
// Every reminder is sent once (remembered on the deal), and the deal keeps a log of what went out.
import { adminClient, appUrl } from './base44.js';
import { notifyPeople } from './team.js';
import { SendEmail } from './integrations.js';
import { brandFor, portalLink, esc } from './clientPortal.js';
import { planFor, dueSoon, OPEN, teamOf, autopilotOf } from '../../shared/autopilot.js';
import { todayStr, dealDeadlines } from '../../shared/dealTimeline.js';

const lc = (e) => String(e || '').toLowerCase().trim();
const TZ = 'America/New_York';
const hourIn = (tz, now) => { try { return Number(now.toLocaleString('en-US', { timeZone: tz, hour: '2-digit', hour12: false })) % 24; } catch { return now.getUTCHours(); } };
const pretty = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const shortDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const dealLink = (tx) => `/Transactions/${tx.id}`;
const flat = (row) => (row ? { ...(row.extra || {}), ...row } : row);

function whenWords(step, date) {
  if (step === 'late') return `was due ${shortDay(date)} and isn't marked done`;
  if (step === 'd1' || step === 'p1') return `is tomorrow, ${pretty(date)}`;
  return `is in 3 days, ${pretty(date)}`;
}

// What a party is told, by deadline (plain, friendly, no prices or internal notes).
const PARTY_LINE = {
  earnest_money_due_date: 'the earnest money deposit is due',
  inspection_date: 'the home inspection',
  inspection_contingency_date: 'the inspection contingency period ends',
  appraisal_date: 'the appraisal',
  financing_contingency_date: 'the financing contingency deadline',
  loan_approval_date: 'the loan commitment deadline',
  title_deadline_date: 'the title commitment deadline',
  final_walkthrough_date: 'the final walk-through',
  closing_date: 'closing',
};

async function partyEmail({ to, tx, item, brand, agent }) {
  const first = String(to.name || '').split(' ')[0] || 'there';
  const what = PARTY_LINE[item.field] || item.label.toLowerCase();
  const color = brand?.color || '#2563eb';
  const portal = to.portal_token ? `<p><a href="${esc(portalLink(to.portal_token))}" style="display:inline-block;padding:11px 22px;background:${esc(color)};color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Open your client portal</a></p>` : '';
  const line = item.step === 'p3' ? `A heads-up: ${what} for <b>${esc(tx.property_address || 'the property')}</b> is in 3 days, on <b>${esc(pretty(item.date))}</b>.`
    : `A reminder: ${what} for <b>${esc(tx.property_address || 'the property')}</b> is tomorrow, <b>${esc(pretty(item.date))}</b>.`;
  await SendEmail({
    to: to.email,
    subject: `Reminder: ${item.label} ${item.step === 'p3' ? 'in 3 days' : 'tomorrow'} · ${tx.property_address || 'your transaction'}`,
    from_name: agent?.name || brand?.name || 'Your agent',
    reply_to: agent?.email || undefined,
    body: `<div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.55;color:#1f2937">
${brand?.logo ? `<img src="${esc(brand.logo)}" alt="${esc(brand.name)}" style="max-height:44px;margin-bottom:12px">` : ''}
<p>Hi ${esc(first)},</p>
<p>${line}</p>
<p>If anything has changed or you need something from us, just reply to this email.</p>
${portal}
<p>${esc(agent?.name || '')}${brand?.name ? `<br><span style="color:#6b7280">${esc(brand.name)}</span>` : ''}</p>
</div>`,
    text: `Hi ${first},\n\n${line.replace(/<[^>]+>/g, '')}\n\nIf anything has changed or you need something from us, just reply to this email.\n\n${agent?.name || ''}`,
  });
}

async function brokerageDefaults(db, ids) {
  const { data } = await db.from('brokerage_settings').select('brokerage_id, extra').in('brokerage_id', ids);
  return new Map((data || []).map((r) => [r.brokerage_id, { parties: r.extra?.autopilot_parties !== false, tz: r.extra?.timezone || TZ }]));
}

/** One hour's work. Returns counts. `now` can be set for tests. */
export async function runAutopilot(E, { now = new Date() } = {}) {
  const db = adminClient();
  const { data: rows } = await db.from('transaction').select('*').or('status.is.null,status.not.in.(closed,cancelled,canceled,withdrawn,expired,draft)').limit(5000);
  const deals = (rows || []).map(flat).filter(OPEN);
  const defaults = await brokerageDefaults(db, [...new Set(deals.map((t) => t.brokerage_id).filter(Boolean))]);
  let reminders = 0; let partyEmails = 0;

  // 1) Deadline reminders, at 8am brokerage time.
  for (const tx of deals) {
    const d = defaults.get(tx.brokerage_id) || { parties: true, tz: TZ };
    if (hourIn(d.tz, now) < 8) continue;
    const today = todayStr(d.tz, now);
    // Contacts are only needed when something is coming up in the next 3 days.
    const soon = dealDeadlines(tx, today).some((x) => !x.done && x.daysLeft >= 0 && x.daysLeft <= 3);
    const contacts = soon ? await E.TransactionContact.filter({ transaction_id: tx.id }, 'created_date', 200).catch(() => []) : [];
    const todays = planFor(tx, contacts, { today, brokerageDefaults: d }).filter((p) => p.send_on === today);
    if (!todays.length) continue;

    const sent = [...(tx.autopilot_sent || [])];
    const log = [...(tx.autopilot_log || [])];
    let brand = null; let agent = null;
    for (const item of todays) {
      try {
        if (item.audience === 'team') {
          const late = item.step === 'late';
          await notifyPeople(E, {
            brokerageId: tx.brokerage_id, people: item.to,
            title: late ? `Overdue: ${item.label} · ${tx.property_address || 'deal'}` : `${item.label} ${item.step === 'd1' ? 'tomorrow' : 'in 3 days'} · ${tx.property_address || 'deal'}`,
            message: `${item.label} ${whenWords(item.step, item.date)}.${late ? ' Mark it done on the deal, or update the date.' : ''}`,
            link: dealLink(tx), referenceId: tx.id, referenceType: 'Transaction', pushKind: 'deal',
            email: item.step !== 'd3', // the 3-day heads-up is in the app and on the phone only
          });
          reminders += 1;
        } else {
          brand ||= await brandFor(E, tx.brokerage_id);
          agent ||= teamOf(tx).find((p) => p.role === 'agent') || null;
          for (const to of item.to) {
            const c = contacts.find((x) => lc(x.email) === to.email);
            await partyEmail({ to: { ...to, portal_token: c?.is_client ? c?.portal_token : null }, tx, item, brand, agent });
            partyEmails += 1;
          }
        }
        sent.push(item.key);
        log.push({ at: now.toISOString(), key: item.key, label: item.label, date: item.date, step: item.step, audience: item.audience, to: item.to.map((p) => p.name) });
      } catch (e) { console.error('autopilot send', tx.id, item.key, e.message); }
    }
    await E.Transaction.update(tx.id, { autopilot_sent: sent.slice(-200), autopilot_log: log.slice(-60) }).catch((e) => console.error('autopilot save', tx.id, e.message));
  }

  // 2) The morning list, at 7am in each person's own time zone.
  const digests = await morningLists(E, db, deals, now);
  return { reminders, party_emails: partyEmails, digests };
}

async function morningLists(E, db, deals, now) {
  const people = new Map(); // email -> deals they're on
  for (const tx of deals.filter((t) => autopilotOf(t).on)) for (const p of teamOf(tx)) { if (!people.has(p.email)) people.set(p.email, []); people.get(p.email).push(tx); }
  if (!people.size) return 0;
  const { data: profiles } = await db.from('profiles').select('email, full_name, display_name, timezone, suspended, brokerage_id, extra').in('email', [...people.keys()]);
  const byEmail = new Map((profiles || []).map((p) => [lc(p.email), { ...(p.extra || {}), ...p }]));
  // Checklist items assigned to them, due by today.
  const ids = deals.map((t) => t.id);
  const lists = [];
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await db.from('checklist').select('subject_id, items').eq('subject_type', 'transaction').in('subject_id', ids.slice(i, i + 300));
    lists.push(...(data || []));
  }
  let sent = 0;
  const marks = new Map(); // brokerage -> state row
  for (const [email, txs] of people) {
    const p = byEmail.get(email);
    if (!p || p.suspended || p.notify_prefs?.deal_digest === false) continue;
    const tz = p.timezone || TZ;
    if (hourIn(tz, now) !== 7) continue;
    const today = todayStr(tz, now);
    const name = `autopilot-digest:${p.brokerage_id}`;
    if (!marks.has(name)) {
      const { data } = await db.from('app_secret').select('value').eq('name', name).maybeSingle();
      marks.set(name, data?.value?.date === today ? data.value : { date: today, sent: [] });
    }
    const mark = marks.get(name);
    if (mark.sent.includes(email)) continue;

    const rows = [];
    for (const tx of txs) {
      for (const d of dueSoon(tx, today)) rows.push({ tx, text: d.label, date: d.date, days: d.daysLeft });
      for (const cl of lists.filter((l) => l.subject_id === tx.id)) {
        for (const it of cl.items || []) {
          if (lc(it.assignee_email) !== email || !it.due_date || it.due_date > today || ['approved', 'exempt', 'done'].includes(it.status)) continue;
          rows.push({ tx, text: it.title, date: it.due_date, days: it.due_date < today ? -1 : 0, task: true });
        }
      }
    }
    if (!rows.length) continue;
    rows.sort((a, b) => a.days - b.days);
    const late = rows.filter((r) => r.days < 0).length; const todayN = rows.filter((r) => r.days === 0).length;
    const tag = (r) => (r.days < 0 ? 'Overdue' : r.days === 0 ? 'Today' : r.days === 1 ? 'Tomorrow' : shortDay(r.date));
    const head = [late && `${late} overdue`, todayN && `${todayN} due today`, rows.length - late - todayN && `${rows.length - late - todayN} coming up`].filter(Boolean).join(', ');
    const html = `<p>Here's what's on your deals today.</p><table style="border-collapse:collapse;width:100%">${rows.slice(0, 25).map((r) => `
<tr><td style="padding:6px 8px 6px 0;white-space:nowrap;color:${r.days < 0 ? '#dc2626' : r.days === 0 ? '#d97706' : '#6b7280'};font-weight:bold;vertical-align:top">${esc(tag(r))}</td>
<td style="padding:6px 0"><b>${esc(r.text)}</b>${r.task ? ' (checklist)' : ''}<br><a href="${esc(appUrl() + dealLink(r.tx))}" style="color:#2563eb">${esc(r.tx.property_address || 'Deal')}</a></td></tr>`).join('')}</table>`;
    try {
      await notifyPeople(E, {
        brokerageId: p.brokerage_id, people: [{ email, full_name: p.display_name || p.full_name }],
        title: `Today on your deals: ${head}`,
        message: rows.slice(0, 2).map((r) => `${tag(r)}: ${r.text} (${r.tx.property_address || 'deal'})`).join(' · '),
        link: '/Dashboard', referenceType: 'Digest', pushKind: 'deal', emailBody: html,
      });
      mark.sent.push(email);
      sent += 1;
    } catch (e) { console.error('morning list', email, e.message); }
  }
  for (const [name, value] of marks) await db.from('app_secret').upsert({ name, value }, { onConflict: 'name' });
  return sent;
}
