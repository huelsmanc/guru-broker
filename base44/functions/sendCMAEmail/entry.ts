import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { recipientEmail, cmaReport, address, customMessage } = await req.json();

    if (!recipientEmail || !cmaReport) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Format the report data into a professional email body
    const reportHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 8px 0 0 0; opacity: 0.9; }
    .section { margin-bottom: 30px; }
    .section h2 { font-size: 18px; color: #667eea; border-bottom: 2px solid #667eea; padding-bottom: 10px; margin-bottom: 15px; }
    .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px; }
    .stat-box { background: #f5f5f5; padding: 15px; border-radius: 6px; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px; }
    .stat-value { font-size: 20px; font-weight: bold; color: #333; }
    .comps { margin-top: 20px; }
    .comp-card { border: 1px solid #ddd; border-radius: 6px; padding: 15px; margin-bottom: 15px; background: #f9f9f9; }
    .comp-address { font-weight: bold; color: #333; margin-bottom: 8px; }
    .comp-details { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 13px; margin-bottom: 10px; }
    .comp-detail { }
    .comp-detail-label { color: #666; font-size: 11px; }
    .comp-detail-value { font-weight: bold; color: #333; }
    .price-info { border-top: 1px solid #ddd; padding-top: 10px; font-size: 13px; }
    .price-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
    .custom-message { background: #fffacd; border-left: 4px solid #ffd700; padding: 15px; margin-top: 30px; border-radius: 4px; }
    .custom-message p { margin: 0; font-style: italic; color: #333; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
    .footer-name { font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CMA Report</h1>
      <p>${address}</p>
    </div>

    <div class="section">
      <h2>Market Analysis & Valuation</h2>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-label">Price Per Sq Ft</div>
          <div class="stat-value">$${cmaReport.marketAnalysis.avgPricePerSqft?.toFixed(0) || 'N/A'}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Avg Days on Market</div>
          <div class="stat-value">${cmaReport.marketAnalysis.avgDaysOnMarket || 'N/A'}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Market Condition</div>
          <div class="stat-value">${cmaReport.marketAnalysis.marketCondition || 'Balanced'}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Recommended Price</div>
          <div class="stat-value">${cmaReport.marketAnalysis.recommendedPriceRange}</div>
        </div>
      </div>

      <p><strong>Market Trend:</strong> ${cmaReport.marketAnalysis.marketTrend}</p>
      ${cmaReport.marketAnalysis.priceAdjustments ? `<p><strong>Price Adjustments:</strong> ${cmaReport.marketAnalysis.priceAdjustments}</p>` : ''}
    </div>

    <div class="section">
      <h2>Rehab & Condition Assessment</h2>
      <p>${cmaReport.rehabAssessment}</p>
    </div>

    <div class="section">
      <h2>Comparable Properties</h2>
      ${cmaReport.comparables?.map((comp, idx) => `
        <div class="comp-card">
          <div class="comp-address">${comp.address}</div>
          <div class="comp-details">
            <div class="comp-detail">
              <div class="comp-detail-label">Beds • Baths</div>
              <div class="comp-detail-value">${comp.beds} • ${comp.baths}</div>
            </div>
            <div class="comp-detail">
              <div class="comp-detail-label">Sq Ft</div>
              <div class="comp-detail-value">${(comp.sqft / 1000).toFixed(1)}K</div>
            </div>
            <div class="comp-detail">
              <div class="comp-detail-label">Days on Market</div>
              <div class="comp-detail-value">${comp.daysOnMarket}d</div>
            </div>
          </div>
          <div class="price-info">
            <div class="price-row">
              <span>Sold Price:</span>
              <strong>$${comp.soldPrice?.toLocaleString()}</strong>
            </div>
            <div class="price-row">
              <span>List Price:</span>
              <strong>$${comp.listPrice?.toLocaleString()}</strong>
            </div>
            ${comp.soldDate ? `
              <div class="price-row">
                <span>Sold Date:</span>
                <strong>${comp.soldDate}</strong>
              </div>
            ` : ''}
          </div>
          ${comp.upgrades?.length > 0 ? `
            <div style="margin-top: 10px; font-size: 12px;">
              <strong>Upgrades:</strong> ${comp.upgrades.slice(0, 3).join(', ')}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>

    ${customMessage ? `
      <div class="custom-message">
        <p><strong>Message from ${user.full_name}:</strong></p>
        <p>${customMessage}</p>
      </div>
    ` : ''}

    <div class="footer">
      <p>This CMA report was generated by <span class="footer-name">${user.full_name}</span></p>
      <p>${user.email}</p>
    </div>
  </div>
</body>
</html>
    `;

    await base44.integrations.Core.SendEmail({
      to: recipientEmail,
      subject: `CMA Report: ${address}`,
      body: reportHtml,
    });

    return Response.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Email send error:', error);
    return Response.json({ error: error.message || 'Failed to send email' }, { status: 500 });
  }
});