// Who does what at a brokerage, and how to reach them.
// Permissions live in `role` (user/agent, admin, broker, super_admin).
// Team duties live in `duties` (['tc'], ['compliance'], or both), so an agent can also be a TC.
import { appUrl } from './base44.js';
import { SendEmail } from './integrations.js';
import { esc } from './esign.js';

import { isAdminRole, can, normalizeRole } from '../../shared/permissions.generated.js';
export { isAdminRole, can };
// Kept for older call sites; prefer isAdminRole(role) / can(profile, key).
export const ADMIN_ROLES = ['admin', 'broker', 'owner', 'office_admin', 'super_admin'];

// People with a duty: ticked in Manage Users, or (for TCs) given the TC role.
export async function withDuty(entities, brokerageId, duty) {
  const rows = await entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 2000);
  return rows.filter((u) => !u.suspended && ((u.duties || []).includes(duty) || (duty === 'tc' && normalizeRole(u.role) === 'tc')));
}

export async function admins(entities, brokerageId) {
  const rows = await entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 2000);
  return rows.filter((u) => !u.suspended && ['owner', 'broker', 'office_admin'].includes(normalizeRole(u.role)));
}

/** The TC with the fewest open transactions (ties: alphabetical). */
export async function leastLoadedTc(entities, brokerageId) {
  const tcs = await withDuty(entities, brokerageId, 'tc');
  if (!tcs.length) return null;
  const open = await entities.Transaction.filter({ brokerage_id: brokerageId, status: 'active' }, '-created_date', 1000);
  const load = new Map(tcs.map((t) => [t.email.toLowerCase(), 0]));
  for (const tx of open) {
    const k = String(tx.tc_email || '').toLowerCase();
    if (load.has(k)) load.set(k, load.get(k) + 1);
  }
  const pick = [...tcs].sort((a, b) => load.get(a.email.toLowerCase()) - load.get(b.email.toLowerCase()))[0];
  return { email: pick.email, name: pick.display_name || pick.full_name || pick.email };
}

const nameOf = (u) => u.display_name || u.full_name || u.name || u.email;

/**
 * In-app notification + email to each person (deduplicated).
 * people: [{ email, name }], link: app path like '/Offers?open=123'
 */
export async function notifyPeople(entities, { brokerageId, people, title, message, link, referenceId, referenceType, emailBody, attachments, email: sendEmail = true }) {
  const seen = new Set();
  for (const p of people) {
    const email = String(p?.email || '').toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    await entities.Notification.create({
      brokerage_id: brokerageId, user_email: email, title, description: message, type: referenceType?.toLowerCase() || 'info',
      action_url: link, reference_id: referenceId, reference_type: referenceType, read: false,
    }).catch((e) => console.error('notification failed', e.message));
    if (!sendEmail) continue;
    await SendEmail({
      to: email,
      subject: title,
      from_name: 'Guru Broker',
      attachments,
      body: `<div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.55;color:#1f2937">
<p>Hi ${esc(nameOf(p))},</p>
<p>${esc(message)}</p>
${emailBody || ''}
${link ? `<p><a href="${esc(appUrl() + link)}" style="display:inline-block;padding:11px 22px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Open in Guru Broker</a></p>` : ''}
</div>`,
    }).catch((e) => console.error('email failed', email, e.message));
  }
  return seen.size;
}

/** People who may be @mentioned on a deal (or an agent's onboarding): those who can already see it. */
export async function mentionablePeople(entities, brokerageId, { tx, subjectEmail }) {
  const people = (await entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 2000)).filter((u) => !u.suspended);
  const onDeal = new Set((tx ? [tx.agent_email, tx.tc_email, ...(tx.co_agents || []).map((a) => a.email)] : [subjectEmail]).map((e) => String(e || '').toLowerCase()));
  const out = new Map();
  for (const u of people) {
    const e = String(u.email || '').toLowerCase();
    const ok = onDeal.has(e) || isAdminRole(u.role) || can(u, 'docs.approve') || (tx ? can(u, 'tx.all') : can(u, 'users.manage'));
    if (ok) out.set(e, { email: e, name: u.display_name || u.full_name || e });
  }
  return out;
}
