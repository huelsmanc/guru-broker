// Ported from Base44 function `closingDateReminder`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const transactions = await base44.asServiceRole.entities.Transaction.filter(
      { status: 'active' },
      'closing_date',
      500
    );

    const now = new Date();
    // Fire reminders for dates that are 47–48 hours away
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const in47h = new Date(now.getTime() + 47 * 60 * 60 * 1000);

    const KEY_DATES = [
      { field: 'closing_date', label: 'Closing Date', emoji: '🏠' },
      { field: 'inspection_date', label: 'Inspection Date', emoji: '🔍' },
      { field: 'appraisal_date', label: 'Appraisal Date', emoji: '📊' },
      { field: 'financing_contingency_date', label: 'Financing Contingency Deadline', emoji: '💰' },
      { field: 'inspection_contingency_date', label: 'Inspection Contingency Deadline', emoji: '📋' },
      { field: 'loan_approval_date', label: 'Loan Approval Deadline', emoji: '🏦' },
      { field: 'title_deadline_date', label: 'Title Commitment Deadline', emoji: '📝' },
    ];

    const wrap = (body, emoji, label) => `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#333;line-height:1.6;">
        <div style="background:#667eea;padding:20px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:18px;">${emoji} 48-Hour Deadline Reminder</h2>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
          ${body}
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
          <p style="font-size:12px;color:#999;">This is an automated reminder from your transaction management system.</p>
        </div>
      </div>
    `;

    let totalSent = 0;

    await Promise.all(transactions.map(async (tx) => {
      const recipients = [];
      if (tx.agent_email) recipients.push({ email: tx.agent_email, name: tx.agent_name });
      if (tx.tc_email && tx.tc_email !== tx.agent_email) {
        recipients.push({ email: tx.tc_email, name: tx.tc_name });
      }
      if (recipients.length === 0) return;

      const buyers = tx.buyers?.length ? tx.buyers.join(', ') : tx.buyer_name || '';
      const sellers = tx.sellers?.length ? tx.sellers.join(', ') : tx.seller_name || '';

      for (const keyDate of KEY_DATES) {
        const dateVal = tx[keyDate.field];
        if (!dateVal) continue;

        const d = new Date(dateVal);
        d.setHours(23, 59, 59, 999);

        const isUpcoming = d >= in47h && d <= in48h;
        if (!isUpcoming) continue;

        const formatted = new Date(dateVal).toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        await Promise.all(recipients.map(async (r) => {
          const body = `
            <p>Hi ${r.name || r.email},</p>
            <p>This is a reminder that the <strong>${keyDate.label}</strong> for the following transaction is <strong>less than 48 hours away</strong>:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;width:40%;">Property</td><td style="padding:8px 12px;border:1px solid #e5e7eb;">${tx.property_address}</td></tr>
              <tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">${keyDate.label}</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#ef4444;font-weight:600;">${formatted}</td></tr>
              ${buyers ? `<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Buyer(s)</td><td style="padding:8px 12px;border:1px solid #e5e7eb;">${buyers}</td></tr>` : ''}
              ${sellers ? `<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Seller(s)</td><td style="padding:8px 12px;border:1px solid #e5e7eb;">${sellers}</td></tr>` : ''}
              ${tx.sale_price ? `<tr><td style="padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;font-weight:600;">Sale Price</td><td style="padding:8px 12px;border:1px solid #e5e7eb;">$${tx.sale_price.toLocaleString()}</td></tr>` : ''}
            </table>
            <p>Please ensure all necessary steps are completed before this deadline.</p>
            <p>Log in to review the full transaction details and checklist.</p>
          `;

          await base44.asServiceRole.integrations.Core.SendEmail({
            to: r.email,
            subject: `${keyDate.emoji} 48hr Reminder: ${keyDate.label} – ${tx.property_address}`,
            body: wrap(body, keyDate.emoji, keyDate.label),
          });
          totalSent++;
        }));
      }
    }));

    return Response.json({ sent: totalSent, checked: transactions.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});