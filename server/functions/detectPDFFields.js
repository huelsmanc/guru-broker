// Ported from Base44 function `detectPDFFields`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';
import pdfjsLib from 'pdfjs-dist/build/pdf.js';

export default (async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { documentUrl } = await req.json();
    if (!documentUrl) {
      return Response.json({ error: 'documentUrl required' }, { status: 400 });
    }

    const pdfResponse = await fetch(documentUrl);
    const pdfBytes = await pdfResponse.arrayBuffer();

    if (pdfjsLib.GlobalWorkerOptions) {
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = ''; } catch(_) {}
    }

    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBytes),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    const fields = [];

    // Use PDF annotations (AcroForm fields) - these are the actual writable fields
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const annotations = await page.getAnnotations();

        for (const annotation of annotations) {
          // Only process form field annotations (Widget type)
          if (annotation.subtype !== 'Widget') continue;

          const fieldType = annotation.fieldType;
          const fieldName = (annotation.fieldName || '').toLowerCase();
          const rect = annotation.rect; // [x1, y1, x2, y2] in PDF units

          if (!rect || rect.length < 4) continue;

          // Convert PDF rect to percentage-based position
          const x1 = rect[0];
          const y1 = rect[1];
          const x2 = rect[2];
          const y2 = rect[3];

          const xPct = (x1 / viewport.width) * 100;
          // PDF y=0 is bottom, we need top-down
          const yPct = ((viewport.height - y2) / viewport.height) * 100;
          const widthPct = ((x2 - x1) / viewport.width) * 100;
          const heightPx = Math.max(30, (y2 - y1) * 1.33); // scale pt to px approx

          // Determine field type from AcroForm field type and name
          let detectedType = 'text';
          if (fieldType === 'Sig') {
            detectedType = 'signature';
          } else if (fieldType === 'Tx') {
            if (/initial/i.test(fieldName)) {
              detectedType = 'initial';
            } else if (/date/i.test(fieldName)) {
              detectedType = 'date';
            } else if (/sign/i.test(fieldName)) {
              detectedType = 'signature';
            } else {
              detectedType = 'text';
            }
          } else if (fieldType === 'Btn') {
            // Buttons / checkboxes — skip or treat as text
            continue;
          }

          fields.push({
            id: `auto-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            type: detectedType,
            page: pageNum - 1,
            x: Math.max(0, Math.min(xPct, 95)),
            y: Math.max(0, Math.min(yPct, 95)),
            width: Math.max(10, Math.min(widthPct, 50)),
            height: heightPx,
            signer_index: 0,
            required: true,
          });
        }
      } catch (err) {
        console.error(`Page ${pageNum} annotation error:`, err.message);
      }
    }

    console.log(`Detected ${fields.length} form fields from PDF annotations`);
    return Response.json({ fields });
  } catch (error) {
    console.error('PDF parsing error:', error);
    return Response.json({ error: error.message, fields: [] }, { status: 200 });
  }
});