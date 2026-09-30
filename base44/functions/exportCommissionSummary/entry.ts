import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.role === 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { transaction_id, agent_email, agent_name } = await req.json();
    const tx = await base44.asServiceRole.entities.Transaction.get(transaction_id);

    // Fetch all transactions for this agent for payroll summary
    const agentTxs = await base44.asServiceRole.entities.Transaction.filter({
      agent_email,
      status: 'closed'
    }, '-closing_date', 500);

    // Build CSV
    const headers = ['Property Address', 'Closing Date', 'Sale Price', 'GCI', 'Agent Split %', 'Agent Net', 'Brokerage Fee %', 'Brokerage Fee', 'Tx Fee %', 'Tx Fee', 'Notes'];
    const rows = agentTxs
      .filter(t => t.commission_amount)
      .map(t => [
        t.property_address,
        t.closing_date || '',
        t.commission_sale_price || '',
        t.commission_amount || '',
        t.agent_split_percentage || '',
        t.agent_net || '',
        t.brokerage_fee_percentage || '',
        t.brokerage_fee || '',
        t.transaction_fee_percentage || '',
        t.transaction_fee || '',
        t.commission_notes || '',
      ]);

    // Add totals
    const totalGci = agentTxs.reduce((sum, t) => sum + (parseFloat(t.commission_amount) || 0), 0);
    const totalAgentNet = agentTxs.reduce((sum, t) => sum + (parseFloat(t.agent_net) || 0), 0);
    const totalBrokerageFee = agentTxs.reduce((sum, t) => sum + (parseFloat(t.brokerage_fee) || 0), 0);
    const totalTxFee = agentTxs.reduce((sum, t) => sum + (parseFloat(t.transaction_fee) || 0), 0);

    rows.push(['', '', 'TOTALS', totalGci, '', totalAgentNet, '', totalBrokerageFee, '', totalTxFee, '']);

    // Format CSV
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${agent_name.replace(/\s+/g, '_')}_commission_${timestamp}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});