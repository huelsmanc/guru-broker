// Invite and sign-in emails sent by Guru Broker itself (through Resend, from gurubroker.app),
// instead of Supabase's plain built-in emails, which Gmail tends to file as spam.
// The link is still made by Supabase (generateLink), so signing in works exactly as before.
import { Core } from './integrations.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ownMailReady = () => !!process.env.RESEND_API_KEY;

function layout({ heading, lines, button, link, footer }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5f7;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
<p style="margin:0 0 14px;font-size:20px;font-weight:700">${esc(heading)}</p>
${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55">${esc(l)}</p>`).join('')}
<p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${esc(button)}</a></p>
<p style="margin:0 0 6px;font-size:12px;color:#6b7280">If the button doesn't work, copy this link into your browser:</p>
<p style="margin:0 0 18px;font-size:12px;word-break:break-all"><a href="${esc(link)}" style="color:#2563eb">${esc(link)}</a></p>
<p style="margin:0;font-size:12px;color:#9ca3af">${esc(footer)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [heading, '', ...lines, '', `${button}: ${link}`, '', footer].join('\n');
  return { html, text };
}

async function brokerageName(admin, id) {
  if (!id) return '';
  const { data } = await admin.from('brokerage').select('name').eq('id', id).maybeSingle();
  return data?.name || '';
}

/**
 * Creates the login (if needed) and emails a "join your team" link. Returns { user, sent }.
 * Throws Supabase's error (e.g. "already registered") so callers can handle existing logins.
 */
export async function sendInvite(admin, { email, redirectTo, fullName, brokerageId, inviter }) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo, data: fullName ? { full_name: fullName } : undefined } });
  if (error) throw error;
  const team = await brokerageName(admin, brokerageId);
  const first = String(fullName || '').split(' ')[0];
  const { html, text } = layout({
    heading: team ? `Join ${team} on Guru Broker` : "You're invited to Guru Broker",
    lines: [
      `Hi${first ? ` ${first}` : ''},`,
      `${inviter || 'Your broker'} invited you to ${team || 'your team'}'s workspace on Guru Broker, where your deals, documents, training and team chat live.`,
      'Tap below to set your password and get started. The link works once and expires in 24 hours.',
    ],
    button: 'Set up my account',
    link: data.properties.action_link,
    footer: `You're getting this because ${inviter || 'someone at your brokerage'} added ${email} to ${team || 'their team'}. If that's not you, you can ignore this email.`,
  });
  await Core.SendEmail({ to: email, subject: team ? `${inviter || 'Your broker'} invited you to join ${team}` : 'Your Guru Broker invite', body: html, text, from_name: team || 'Guru Broker', reply_to: undefined });
  return { user: data.user, sent: true };
}

/** A one-tap sign-in link for someone who already has a login. */
export async function sendSignInLink(admin, { email, redirectTo, brokerageId, inviter }) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } });
  if (error) throw error;
  const team = await brokerageName(admin, brokerageId);
  const { html, text } = layout({
    heading: team ? `You've been added to ${team}` : 'Sign in to Guru Broker',
    lines: [`${inviter || 'Your broker'} added you to ${team || 'a team'} on Guru Broker. You already have an account, so just tap below to sign in.`],
    button: 'Sign in',
    link: data.properties.action_link,
    footer: "If you didn't expect this, you can ignore this email.",
  });
  await Core.SendEmail({ to: email, subject: team ? `You've been added to ${team} on Guru Broker` : 'Sign in to Guru Broker', body: html, text, from_name: team || 'Guru Broker' });
  return { sent: true };
}
