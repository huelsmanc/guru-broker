// Emails the people on a deal (agent, co-agents, TC) when someone else posts an update, uploads a
// file or completes a task. The deal is loaded here with the sender's own access, so the
// recipients and the address come from the deal itself, never from what the browser sent.
import { createClientFromRequest } from '../lib/base44.js';
import { esc } from '../lib/esign.js';
import { SendEmail } from '../lib/integrations.js';

const lc = (e) => String(e || '').toLowerCase().trim();
const clip = (v, n) => String(v ?? '').slice(0, n);

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const body = await req.json().catch(() => ({}));
    const id = body.transaction_id || body.transaction?.id;
    const tx = id ? await base44.entities.Transaction.get(String(id)).catch(() => null) : null;
    if (!tx) return Response.json({ error: 'Deal not found' }, { status: 404 });

    const type = ['update_posted', 'file_uploaded', 'task_completed'].includes(body.type) ? body.type : 'update_posted';
    const detail = body.update || body.actor || {};
    const message = clip(detail.message ?? detail.updateMessage, 2000);
    const fileName = clip(detail.fileName, 200);
    const taskTitle = clip(detail.taskTitle, 200);

    const people = new Map();
    const add = (email, name) => { const e = lc(email); if (e && e !== lc(me.email) && !people.has(e)) people.set(e, name || e); };
    add(tx.agent_email, tx.agent_name);
    for (const a of Array.isArray(tx.co_agents) ? tx.co_agents : []) add(a?.email, a?.name);
    add(tx.tc_email, tx.tc_name);
    if (!people.size) return Response.json({ sent: 0 });

    const who = esc(me.display_name || me.full_name || me.email);
    const address = esc(tx.property_address || 'a deal');
    const subject = {
      update_posted: `New update on ${tx.property_address || 'your deal'}`,
      file_uploaded: `New document on ${tx.property_address || 'your deal'}`,
      task_completed: `Task completed on ${tx.property_address || 'your deal'}`,
    }[type];
    const line = {
      update_posted: `<p><strong>${who}</strong> posted an update on <strong>${address}</strong>:</p><blockquote style="border-left:4px solid #667eea;margin:12px 0;padding:8px 16px;background:#f5f5ff;border-radius:4px;">${esc(message || 'See the deal for details.')}</blockquote>`,
      file_uploaded: `<p><strong>${who}</strong> uploaded <strong>${esc(fileName || 'a new file')}</strong> to <strong>${address}</strong>.</p>`,
      task_completed: `<p><strong>${who}</strong> completed a checklist task on <strong>${address}</strong>:</p><p style="font-weight:600;">✓ ${esc(taskTitle || 'Task completed')}</p>`,
    }[type];

    for (const [email, name] of people) {
      await SendEmail({
        to: email, subject, from_name: 'Guru Broker',
        body: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#333;line-height:1.6;"><p>Hi ${esc(name)},</p>${line}<p>Open the deal in Guru Broker to see more.</p></div>`,
      }).catch((e) => console.error('notifyTransactionActivity email failed', email, e.message));
    }
    return Response.json({ sent: people.size });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
