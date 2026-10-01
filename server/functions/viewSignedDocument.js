// Opens a completed document. New requests get the real signed PDF (built by
// server/lib/esign.js). Documents signed before the migration have no PDF, so they
// still use the original page, which draws signatures over the document.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { readFileBytes } from '../lib/files.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderSignedPage({ submission, document, signatureDataList, numPages }) {
  const docHeight = numPages * 1056;
  const isPdf = document.document_url?.toLowerCase().includes('.pdf') ||
    document.document_url?.includes('application/pdf');

  // Build a map: field_id -> signature data URL (from all signers)
  const fieldSignatures = {};
  for (const sigData of signatureDataList) {
    for (const f of (sigData.fields || [])) {
      if (f.field_id && f.value) {
        fieldSignatures[f.field_id] = f.value;
      }
    }
  }

  const fieldsJson = JSON.stringify(document.fields || []).replace(/</g, '\\u003c');
  const sigsJson = JSON.stringify(fieldSignatures).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Signed: ${esc(document.title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; }

    .header { background: #1e3a5f; color: white; padding: 14px 20px; display: flex; align-items: center; gap: 12px; }
    .header-title { font-size: 16px; font-weight: 700; }
    .header-sub { font-size: 12px; opacity: 0.7; margin-top: 2px; }
    .badge { background: #22c55e; color: white; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; margin-left: auto; }

    .doc-wrap { margin: 20px auto; max-width: 900px; padding: 0 16px 80px; }
    .doc-container { position: relative; background: white; border-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }
    /* doc-inner is the scroll container — everything scrolls together */
    .doc-inner { position: relative; width: 100%; height: ${docHeight}px; }
    .doc-inner iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: none; border-radius: 8px; pointer-events: none; }
    .doc-inner img { width: 100%; display: block; border-radius: 8px; }

    /* Overlays sit inside doc-inner so they scroll with the document */
    .sig-overlay {
      position: absolute;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .sig-overlay img { width: 100%; height: 100%; object-fit: contain; }
    .sig-overlay.text-field {
      background: rgba(254,252,232,0.92);
      border: 1px solid #d97706;
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 13px;
      font-weight: 600;
      color: #1f2937;
      align-items: center;
      justify-content: flex-start;
    }

    .audit-section { margin: 24px auto; max-width: 900px; padding: 0 16px; }
    .audit-box { background: white; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .audit-header { background: #1e3a5f; color: white; padding: 12px 16px; font-size: 14px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { padding: 8px 12px; text-align: left; border-bottom: 2px solid #e5e7eb; background: #f9fafb; color: #374151; }
    td { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; color: #4b5563; }
  </style>
</head>
<body>

<div class="header">
  <div>
    <div class="header-title">📄 ${esc(document.title)}</div>
    <div class="header-sub">Signed document — read only</div>
  </div>
  <span class="badge">✅ Fully Signed</span>
</div>

<div class="doc-wrap">
  <div class="doc-container">
    <div class="doc-inner" id="docInner">
      ${isPdf
        ? `<iframe src="${document.document_url}" title="${document.title}"></iframe>`
        : `<img src="${document.document_url}" alt="${document.title}" />`
      }
    </div>
  </div>
</div>

<div class="audit-section">
  <div class="audit-box">
    <div class="audit-header">📋 Audit Trail</div>
    <table>
      <thead>
        <tr>
          <th>Signer</th><th>Email</th><th>Status</th><th>Signed At</th><th>IP Address</th>
        </tr>
      </thead>
      <tbody>
        ${submission.signers.map(s => `
          <tr>
            <td>${esc(s.name || s.email)}</td>
            <td>${esc(s.email)}</td>
            <td>${s.signed ? '✅ Signed' : '⏳ Pending'}</td>
            <td>${s.signed_at ? new Date(s.signed_at).toLocaleString() : '—'}</td>
            <td>${esc(s.ip_address || '—')}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

<script>
  const ALL_FIELDS = ${fieldsJson};
  const FIELD_SIGS = ${sigsJson};
  const DOC_HEIGHT = ${docHeight};

  window.onload = function() {
    const docInner = document.getElementById('docInner');
    docInner.style.height = DOC_HEIGHT + 'px';

    ALL_FIELDS.forEach(function(field) {
      const sig = FIELD_SIGS[field.id];
      if (!sig) return;

      const el = document.createElement('div');
      el.style.left = field.x + '%';
      el.style.top = field.y + '%';
      el.style.width = (field.width || 18) + '%';
      el.style.height = (field.height || 40) + 'px';

      if (field.type === 'text' || field.type === 'date') {
        el.className = 'sig-overlay text-field';
        el.textContent = sig;
      } else {
        el.className = 'sig-overlay';
        const img = document.createElement('img');
        img.src = sig;
        el.appendChild(img);
      }

      docInner.appendChild(el);
    });
  };
</script>
</body>
</html>`;
}

function renderError(msg) {
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f3f4f6;"><div style="background:white;padding:40px;border-radius:12px;text-align:center;max-width:400px;"><div style="font-size:48px;margin-bottom:16px;">❌</div><h2 style="color:#111;">Error</h2><p style="color:#6b7280;">${msg}</p></div></body></html>`;
}

export default (async (req) => {
  try {
    const url = new URL(req.url);
    const submissionId = url.searchParams.get('submission_id');

    if (!submissionId) {
      return new Response(renderError('Missing submission_id parameter.'), { headers: { 'Content-Type': 'text/html' }, status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // Load submission
    const submissions = await base44.asServiceRole.entities.ESignSubmission.filter({ id: submissionId }, '-created_date', 1);
    const submission = submissions[0];
    if (!submission) {
      return new Response(renderError('Submission not found.'), { headers: { 'Content-Type': 'text/html' }, status: 404 });
    }

    // Access: the private key from the emailed link, or a signed-in member of the brokerage.
    const key = url.searchParams.get('key');
    let allowed = !!submission.access_key && key === submission.access_key;
    if (!allowed) {
      const me = await base44.auth.me().catch(() => null);
      allowed = !!me && (me.role === 'super_admin' || (me.brokerage_id && me.brokerage_id === submission.brokerage_id));
    }
    // Submissions from before the migration have no key; keep their old links working.
    if (!allowed && submission.access_key) {
      return new Response(renderError('This link is not valid.'), { headers: { 'Content-Type': 'text/html' }, status: 403 });
    }

    if (submission.signed_pdf_path) {
      const path = String(submission.signed_pdf_path).replace(/^private-files\//, '');
      const { data, error } = await adminClient().storage.from('private-files').createSignedUrl(path, 600, {
        download: url.searchParams.get('download') ? 'signed.pdf' : undefined,
      });
      if (!error && data?.signedUrl) return new Response(null, { status: 302, headers: { Location: data.signedUrl } });
    }

    // Load document
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: submission.document_id }, '-created_date', 1);
    const doc = docs[0];
    if (!doc) {
      return new Response(renderError('Document not found.'), { headers: { 'Content-Type': 'text/html' }, status: 404 });
    }

    // Get accessible document URL
    let documentUrl = doc.document_url;
    if (documentUrl && documentUrl.startsWith('/')) {
      try {
        const signedRes = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: documentUrl, expires_in: 86400 });
        documentUrl = signedRes.signed_url || documentUrl;
      } catch (err) {
        console.error('Failed to create signed URL:', err.message);
      }
    }

    // Load all signature data for this submission
    const signatureDataList = await base44.asServiceRole.entities.SignatureData.filter({ submission_id: submissionId }, '-created_date', 100);

    // Detect page count
    let numPages = 1;
    try {
      const text = new TextDecoder().decode(await readFileBytes(documentUrl));
      const matches = text.match(/\/Type\s*\/Page[^s]/g) || [];
      numPages = Math.max(1, matches.length);
    } catch {}

    const html = renderSignedPage({
      submission,
      document: { ...doc, document_url: documentUrl },
      signatureDataList,
      numPages,
    });

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (err) {
    console.error('viewSignedDocument error:', err);
    return new Response(renderError('An unexpected error occurred.'), { headers: { 'Content-Type': 'text/html' }, status: 500 });
  }
});