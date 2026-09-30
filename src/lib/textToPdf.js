import { jsPDF } from 'jspdf';

// Turns plain text (a contract or offer) into a letter-size PDF File, ready to upload
// and send for signature.
export function textToPdfFile(text, filename = 'document.pdf') {
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 60;
  const width = pdf.internal.pageSize.getWidth() - margin * 2;
  const bottom = pdf.internal.pageSize.getHeight() - margin;
  let y = margin;
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  lines.forEach((raw, i) => {
    const isTitle = i === 0 && raw.trim();
    pdf.setFont('times', isTitle ? 'bold' : 'normal');
    pdf.setFontSize(isTitle ? 15 : 11);
    const wrapped = raw.trim() ? pdf.splitTextToSize(raw, width) : [''];
    for (const line of wrapped) {
      if (y > bottom) { pdf.addPage(); y = margin; }
      pdf.text(line, margin, y);
      y += isTitle ? 22 : 15;
    }
    if (isTitle) y += 6;
  });
  return new File([pdf.output('blob')], filename.endsWith('.pdf') ? filename : `${filename}.pdf`, { type: 'application/pdf' });
}
