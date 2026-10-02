// New: the platform owner's error list, and the alert email.
//   scheduled every 15 min: { alert: true }  -> emails super admins about new errors (if any)
//   super admin: { action: 'list', show: 'open'|'all' } | { action: 'resolve', id } | { action: 'resolve_all' }
import { createClientFromRequest, isServiceRequest, adminClient, appUrl } from '../lib/base44.js';
import { SendEmail } from '../lib/integrations.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function sendAlerts(db = adminClient()) {
  const { data: fresh, error } = await db.from('app_error').select('*').eq('resolved', false).is('notified_at', null).order('count', { ascending: false }).limit(50);
  if (error) throw error;
  if (!fresh?.length) return { sent: 0, errors: 0 };
  const { data: owners } = await db.from('profiles').select('email, display_name, full_name').eq('role', 'super_admin').neq('suspended', true);
  const to = (owners || []).map((o) => o.email).filter(Boolean);
  if (to.length) {
    const rows = fresh.slice(0, 20).map((e) => `<tr>
<td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top"><b>${esc(e.message).slice(0, 220)}</b><br><span style="color:#6b7280;font-size:12px">${e.source === 'browser' ? 'In the app, page' : 'Server, function'} ${esc(e.location || '?')}</span></td>
<td style="padding:8px;border-bottom:1px solid #eee;vertical-align:top;text-align:right;white-space:nowrap">${e.count}×<br><span style="color:#6b7280;font-size:12px">${(e.users || []).length} ${(e.users || []).length === 1 ? 'person' : 'people'}</span></td></tr>`).join('');
    const subject = `Guru Broker: ${fresh.length} new error${fresh.length === 1 ? '' : 's'}`;
    const body = `<div style="font-family:Arial,sans-serif;max-width:620px;color:#1f2937;line-height:1.5">
<p>${fresh.length === 1 ? 'Something new went wrong' : `${fresh.length} new problems came up`} in Guru Broker${fresh.length > 20 ? ' (showing the 20 most frequent)' : ''}:</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
<p><a href="${esc(appUrl())}/SuperAdmin?tab=errors" style="display:inline-block;margin-top:14px;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">See details</a></p>
<p style="color:#6b7280;font-size:12px">You get one email per new error. If it keeps happening, it's counted on the errors page instead of emailing again. Forward this to your developer if you're not sure what it means.</p></div>`;
    for (const email of to) await SendEmail({ to: email, subject, body, from_name: 'Guru Broker alerts' }).catch((e) => console.error('alert email failed', e.message));
  }
  await db.from('app_error').update({ notified_at: new Date().toISOString() }).in('id', fresh.map((e) => e.id));
  return { sent: to.length, errors: fresh.length };
}

export default async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.alert) {
      if (!isServiceRequest(req)) return Response.json({ error: 'Not available' }, { status: 403 });
      return Response.json(await sendAlerts());
    }
    const me = await createClientFromRequest(req).auth.me();
    if (me.role !== 'super_admin') return Response.json({ error: 'Only the platform owner can see this.' }, { status: 403 });
    const db = adminClient();
    if (body.action === 'resolve' && body.id) {
      await db.from('app_error').update({ resolved: true }).eq('id', String(body.id));
      return Response.json({ ok: true });
    }
    if (body.action === 'resolve_all') {
      const { data } = await db.from('app_error').update({ resolved: true }).eq('resolved', false).select('id');
      return Response.json({ ok: true, resolved: data?.length || 0 });
    }
    let q = db.from('app_error').select('*').order('resolved', { ascending: true }).order('last_seen', { ascending: false }).limit(300);
    if (body.show !== 'all') q = q.eq('resolved', false);
    const { data, error } = await q;
    if (error) throw error;
    return Response.json({ errors: data || [] });
  } catch (error) {
    console.error('appErrors:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
