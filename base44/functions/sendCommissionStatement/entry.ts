import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { transactionId, agentEmail, agentName, propertyAddress, salePrice, commissionAmount, brokerageFee, transactionFee, agentNet } = await req.json();

    const comm = parseFloat(commissionAmount) || 0;
    const broker = parseFloat(brokerageFee) || 0;
    const txFee = parseFloat(transactionFee) || 0;
    const net = parseFloat(agentNet) || (comm - broker - txFee);

    const fmt = (v) => `$${(parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const body = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#333;line-height:1.6;">
        <div style="background:#667eea;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="color:#fff;margin:0;font-size:17px;">Commission Statement</h2>
        </div>
        <div style="background:#fff;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
          <p>Hi ${agentName},</p>
          <p>Here's your commission statement for the closed transaction:</p>
          
          <div style="background:#f5f5f5;padding:16px;border-radius:6px;margin:16px 0;">
            <p style="margin:0 0 12px 0;font-weight:600;">${propertyAddress}</p>
            <table style="width:100%;font-size:13px;">
              <tr>
                <td style="padding:6px 0;color:#666;">Sale Price:</td>
                <td style="text-align:right;padding:6px 0;font-weight:600;">${fmt(salePrice)}</td>
              </tr>
              <tr style="border-top:1px solid #ddd;">
                <td style="padding:8px 0;color:#666;">Gross Commission:</td>
                <td style="text-align:right;padding:8px 0;font-weight:600;color:#059669;">${fmt(comm)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#666;">Brokerage Fee:</td>
                <td style="text-align:right;padding:6px 0;font-weight:600;color:#dc2626;">-${fmt(broker)}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#666;">Transaction Fee:</td>
                <td style="text-align:right;padding:6px 0;font-weight:600;color:#dc2626;">-${fmt(txFee)}</td>
              </tr>
              <tr style="border-top:2px solid #ddd;">
                <td style="padding:10px 0;font-weight:600;font-size:14px;">Your Net Commission:</td>
                <td style="text-align:right;padding:10px 0;font-weight:600;font-size:14px;color:#1e40af;">${fmt(net)}</td>
              </tr>
            </table>
          </div>

          <p style="font-size:13px;color:#666;">Thank you for your hard work on this transaction!</p>
        </div>
      </div>
    `;

    await base44.asServiceRole.integrations.Core.SendEmail({
      to: agentEmail,
      subject: `Commission Statement – ${propertyAddress}`,
      body,
    });

    return Response.json({ sent: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});