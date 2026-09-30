// Ported from Base44 function `generateAuditTrailPDF`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';
import { jsPDF } from 'jspdf';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { docId } = await req.json();

    if (!docId) {
      return Response.json({ error: 'Document ID required' }, { status: 400 });
    }

    // Fetch document
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: docId });
    if (!docs || docs.length === 0) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    const doc = docs[0];

    // Verify all signatories have signed
    const allSigned = doc.signatories?.every(s => s.signed);
    if (!allSigned) {
      return Response.json({ error: 'Not all signatories have signed' }, { status: 400 });
    }

    // Generate PDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPosition = 15;

    // Helper functions
    const addHeading = (text, size = 16, isBold = true) => {
      pdf.setFontSize(size);
      pdf.setFont(undefined, isBold ? 'bold' : 'normal');
      pdf.text(text, 15, yPosition);
      yPosition += size / 2.5;
    };

    const addText = (text, size = 10, color = [0, 0, 0]) => {
      pdf.setFontSize(size);
      pdf.setFont(undefined, 'normal');
      pdf.setTextColor(...color);
      const lines = pdf.splitTextToSize(text, pageWidth - 30);
      pdf.text(lines, 15, yPosition);
      yPosition += lines.length * (size / 2.5);
    };

    const addLine = () => {
      pdf.setDrawColor(200, 200, 200);
      pdf.line(15, yPosition, pageWidth - 15, yPosition);
      yPosition += 5;
    };

    const checkPageBreak = (space = 10) => {
      if (yPosition + space > pageHeight - 10) {
        pdf.addPage();
        yPosition = 15;
      }
    };

    // Reset text color to black
    pdf.setTextColor(0, 0, 0);

    // Title
    addHeading('AUDIT TRAIL CERTIFICATE', 18, true);
    addText('Digital Signature Verification Report', 11);
    yPosition += 3;
    addLine();

    // Document Information
    checkPageBreak(20);
    addHeading('Document Information', 12, true);
    addText(`Document Title: ${doc.title}`, 10);
    addText(`Document ID: ${doc.id}`, 9, [100, 100, 100]);
    addText(`Created: ${new Date(doc.created_date).toLocaleString()}`, 10);
    addText(`Created By: ${doc.created_by_name} (${doc.created_by_email})`, 10);
    if (doc.document_hash) {
      addText(`Document Hash (SHA-256): ${doc.document_hash.substring(0, 32)}...`, 9, [100, 100, 100]);
    }
    yPosition += 5;
    addLine();

    // Signature Details
    checkPageBreak(30);
    addHeading('Signature Details', 12, true);
    
    doc.signatories?.forEach((signer, idx) => {
      checkPageBreak(15);
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(10);
      pdf.text(`${idx + 1}. ${signer.name} (${signer.email})`, 15, yPosition);
      yPosition += 5;

      const signedDate = new Date(signer.signed_date).toLocaleString();
      addText(`Signed: ${signedDate}`, 9);
      if (signer.signature) {
        addText(`Signature: ${signer.signature}`, 9, [70, 70, 70]);
      }
      if (signer.ip_address) {
        addText(`IP Address: ${signer.ip_address}`, 8, [120, 120, 120]);
      }
      yPosition += 2;
    });

    yPosition += 3;
    addLine();

    // Legal Certification
    checkPageBreak(30);
    addHeading('Legal Certification', 12, true);
    
    const legalText = `This document certifies that the above-named signatories have executed the document electronically in compliance with the Electronic Signatures in Global and National Commerce Act (ESIGN), the Uniform Electronic Transactions Act (UETA), and applicable state laws.

Each signatory's electronic signature has the same legal effect, validity, and enforceability as a handwritten signature. The signatures represent the signatories' intent to be bound by the terms of the document.

This audit trail provides evidence of the signing process, including timestamps, authentication methods, and signer identity verification.`;

    pdf.setFontSize(9);
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(0, 0, 0);
    const legalLines = pdf.splitTextToSize(legalText, pageWidth - 30);
    pdf.text(legalLines, 15, yPosition);
    yPosition += legalLines.length * 4;

    yPosition += 5;
    addLine();

    // Verification Information
    checkPageBreak(15);
    pdf.setFontSize(9);
    pdf.setFont(undefined, 'normal');
    pdf.text(`Generated: ${new Date().toLocaleString()}`, 15, yPosition);
    yPosition += 5;
    pdf.text(`Status: All signatories completed`, 15, yPosition);

    // Convert PDF to blob
    const pdfData = pdf.output('arraybuffer');
    const fileName = `audit-trail-${docId}-${Date.now()}.pdf`;

    // Upload PDF to cloud storage
    const formData = new FormData();
    formData.append('file', new Blob([pdfData], { type: 'application/pdf' }), fileName);

    const uploadResponse = await base44.integrations.Core.UploadFile({
      file: new Blob([pdfData], { type: 'application/pdf' }),
    });

    const pdfUrl = uploadResponse.file_url;

    // Update document with audit trail URL
    await base44.asServiceRole.entities.ESignDocument.update(docId, {
      audit_trail_pdf_url: pdfUrl,
    });

    return Response.json({
      status: 'success',
      auditTrailUrl: pdfUrl,
      fileName,
    });
  } catch (error) {
    console.error('Audit trail generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});