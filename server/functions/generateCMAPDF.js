// Ported from Base44 function `generateCMAPDF`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';
import { jsPDF } from 'jspdf';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { address, beds, baths, cmaReport } = await req.json();

    if (!address || !cmaReport) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - margin * 2;
    let yPosition = margin;

    // Color scheme
    const primaryColor = [102, 126, 234]; // #667eea
    const accentColor = [168, 85, 247]; // #a855f7
    const darkText = [30, 30, 30];
    const lightText = [100, 100, 100];

    // Helper: Add text with auto-wrapping
    const addText = (text, size, color = darkText, bold = false, indent = 0) => {
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      if (bold) pdf.setFont(undefined, 'bold');
      
      const lines = pdf.splitTextToSize(text, contentWidth - indent);
      const lineHeight = size * 0.35;
      
      if (yPosition + lineHeight * lines.length > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      
      pdf.text(lines, margin + indent, yPosition);
      yPosition += lineHeight * lines.length + 2;
      
      if (bold) pdf.setFont(undefined, 'normal');
      return yPosition;
    };

    // Helper: Add section divider
    const addDivider = () => {
      if (yPosition + 6 > pageHeight - margin) {
        pdf.addPage();
        yPosition = margin;
      }
      pdf.setDrawColor(...primaryColor);
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 6;
    };

    // ===== PAGE 1: TITLE & MARKET ANALYSIS =====
    
    // Title
    pdf.setFontSize(28);
    pdf.setTextColor(...primaryColor);
    pdf.setFont(undefined, 'bold');
    pdf.text('COMPARATIVE MARKET ANALYSIS', margin, yPosition);
    yPosition += 12;
    
    // Subject property
    addText(address, 16, darkText, true);
    addText(`${beds} Bed • ${baths} Bath`, 11, lightText);
    yPosition += 8;
    
    addDivider();
    yPosition += 3;

    // Market Analysis Section
    addText('MARKET ANALYSIS & VALUATION', 14, primaryColor, true);
    yPosition += 4;

    // Market stats grid
    const stats = [
      { label: 'Price Per Sq Ft', value: `$${cmaReport.marketAnalysis.avgPricePerSqft?.toFixed(0) || 'N/A'}` },
      { label: 'Avg Days on Market', value: `${cmaReport.marketAnalysis.avgDaysOnMarket || 'N/A'} days` },
      { label: 'Market Condition', value: cmaReport.marketAnalysis.marketCondition || 'Balanced' },
      { label: 'Recommended Price', value: cmaReport.marketAnalysis.recommendedPriceRange }
    ];

    stats.forEach(stat => {
      if (yPosition + 8 > pageHeight - margin - 5) {
        pdf.addPage();
        yPosition = margin;
      }
      
      pdf.setFontSize(10);
      pdf.setTextColor(...lightText);
      pdf.text(stat.label + ':', margin, yPosition);
      
      pdf.setFontSize(11);
      pdf.setTextColor(...primaryColor);
      pdf.setFont(undefined, 'bold');
      pdf.text(stat.value, pageWidth - margin - 40, yPosition, { align: 'right' });
      pdf.setFont(undefined, 'normal');
      
      yPosition += 8;
    });

    yPosition += 3;
    addDivider();
    yPosition += 3;

    // Market Trend
    addText('Market Trend', 12, primaryColor, true);
    addText(cmaReport.marketAnalysis.marketTrend || 'Market analysis in progress', 10, darkText);
    yPosition += 5;

    if (cmaReport.marketAnalysis.priceAdjustments) {
      addText('Price Adjustments', 12, primaryColor, true);
      addText(cmaReport.marketAnalysis.priceAdjustments, 10, darkText);
    }

    // ===== COMPARABLE PROPERTIES PAGES =====
    
    if (cmaReport.comparables?.length > 0) {
      // Comparables start on new page
      pdf.addPage();
      yPosition = margin;

      addText('COMPARABLE PROPERTIES', 14, primaryColor, true);
      addText(`${cmaReport.comparables.length} Recent Sales in the Area`, 11, lightText);
      yPosition += 8;
      addDivider();
      yPosition += 3;

      cmaReport.comparables.forEach((comp, idx) => {
        // Check if we need new page
        if (yPosition + 50 > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }

        // Comparable header
        pdf.setFontSize(12);
        pdf.setTextColor(...primaryColor);
        pdf.setFont(undefined, 'bold');
        pdf.text(`${idx + 1}. ${comp.address}`, margin, yPosition);
        pdf.setFont(undefined, 'normal');
        yPosition += 7;

        // Property details grid
        const details = [
          { label: 'Bedrooms', value: comp.beds },
          { label: 'Bathrooms', value: comp.baths },
          { label: 'Square Feet', value: `${(comp.sqft / 1000).toFixed(1)}K` },
          { label: 'Days on Market', value: `${comp.daysOnMarket}d` }
        ];

        // 2x2 grid
        const gridY = yPosition;
        details.forEach((detail, i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const cellX = margin + col * (contentWidth / 2);
          const cellY = gridY + row * 11;

          pdf.setFontSize(9);
          pdf.setTextColor(...lightText);
          pdf.text(detail.label + ':', cellX, cellY);

          pdf.setFontSize(10);
          pdf.setTextColor(...darkText);
          pdf.setFont(undefined, 'bold');
          pdf.text(String(detail.value), cellX, cellY + 4);
          pdf.setFont(undefined, 'normal');
        });

        yPosition = gridY + 22;

        // Price info
        pdf.setDrawColor(235, 235, 235);
        pdf.rect(margin, yPosition, contentWidth, 18);

        pdf.setFontSize(10);
        pdf.setTextColor(...lightText);
        pdf.text('Sale Price:', margin + 3, yPosition + 5);
        pdf.text('List Price:', margin + 3, yPosition + 11);

        pdf.setFontSize(11);
        pdf.setTextColor(...primaryColor);
        pdf.setFont(undefined, 'bold');
        pdf.text(`$${comp.soldPrice?.toLocaleString()}`, pageWidth - margin - 3, yPosition + 5, { align: 'right' });
        pdf.text(`$${comp.listPrice?.toLocaleString()}`, pageWidth - margin - 3, yPosition + 11, { align: 'right' });
        pdf.setFont(undefined, 'normal');

        yPosition += 22;

        // Condition & upgrades
        if (comp.condition || comp.upgrades?.length > 0) {
          pdf.setFontSize(10);
          pdf.setTextColor(...darkText);
          pdf.setFont(undefined, 'bold');
          pdf.text('Property Details:', margin, yPosition);
          pdf.setFont(undefined, 'normal');
          yPosition += 4;

          if (comp.condition) {
            addText(`Condition: ${comp.condition}`, 9, darkText);
          }

          if (comp.upgrades?.length > 0) {
            const upgradeText = comp.upgrades.slice(0, 3).join(' • ');
            addText(`Upgrades: ${upgradeText}`, 9, darkText);
          }
        }

        yPosition += 4;
        addDivider();
        yPosition += 3;
      });
    }

    // ===== FINAL PAGE: SUMMARY & REHAB ASSESSMENT =====
    pdf.addPage();
    yPosition = margin;

    addText('REHAB & CONDITION ASSESSMENT', 14, primaryColor, true);
    yPosition += 4;
    addText(cmaReport.rehabAssessment || 'Assessment pending', 10, darkText);

    yPosition += 10;
    addDivider();
    yPosition += 5;

    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text('This CMA report is prepared for informational purposes and is based on public market data.', margin, pageHeight - 10);
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, margin, pageHeight - 6);

    // Return PDF as base64
    const pdfData = pdf.output('arraybuffer');
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfData)));

    return Response.json({ 
      success: true,
      pdf: pdfBase64,
      filename: `CMA_${address.split(',')[0]}_${new Date().toISOString().split('T')[0]}.pdf`
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});