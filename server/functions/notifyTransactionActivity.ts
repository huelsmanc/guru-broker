// Ported from Base44 function `notifyTransactionActivity`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { type, transaction, actor } = await req.json();

    const recipients = [];
    if (transaction.agent_email) recipients.push({ email: transaction.agent_email, name: transaction.agent_name });
    if (transaction.tc_email && transaction.tc_email !== transaction.agent_email) {
      recipients.push({ email: transaction.tc_email, name: transaction.tc_name });
    }

    const targets = recipients.filter(r => r.email !== actor.email);
    if (targets.length === 0) return Response.json({ sent: 0 });

    const address = transaction.property_address;

    const subjectMap = {
      update_posted: `New Update on ${address}`,
      file_uploaded: `New Document Uploaded – ${address}`,
      task_completed: `Task Completed – ${address}`,
    };

    const bodyMap = {
      update_posted: (name) => `
        <p>Hi ${name},</p>
        <p><strong>${actor.full_name}</strong> posted a new update on <strong>${address}</strong>:</p>
        <blockquote style="border-left:4px solid #667eea;margin:12px 0;padding:8px 16px;background:#f5f5ff;border-radius:4px;">
          ${actor.updateMessage || '(see transaction details)'}
        </blockquote>
        <p>Log in to view the full timeline.</p>
      `,
      file_uploaded: (name) => `
        <p>Hi ${name},</p>
        <p><strong>${actor.full_name}</strong> uploaded <strong>${actor.fileName || 'a new file'}</strong> to <strong>${address}</strong>.</p>
        <p>Log in to view or download the document.</p>
      `,
      task_completed: (name) => `
        <p>Hi ${name},</p>
        <p><strong>${actor.full_name}</strong> completed a checklist task on <strong>${address}</strong>:</p>
        <p style="font-weight:600;">✓ ${actor.taskTitle || 'Task completed'}</p>
      `,
    };

    const wrap = (body) => `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#333;line-height:1.6;">
        <div style="background:#667eea;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:17px;">Transaction Update</h2>
        </div>
        <div style="background:#fff;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
          ${body}
        </div>
      </div>
    `;

    const subject = subjectMap[type] || `Transaction Update – ${address}`;
    const bodyFn = bodyMap[type] || (() => `<p>There was an update on ${address}.</p>`);

    // Send sequentially to avoid CPU spikes from parallel heavy operations
    for (const r of targets) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: r.email,
        subject,
        body: wrap(bodyFn(r.name || r.email)),
      });
    }

    return Response.json({ sent: targets.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});