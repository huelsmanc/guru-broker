// Ported from Base44 function `signingPage`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';


const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const APP_URL = Deno.env.get('BASE44_APP_URL') || 'https://gurubroker.app';

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'GuroBroker E-Sign <noreply@gurubroker.app>', to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Resend error');
  return data;
}

function renderSigningPage({ token, submission, document, signer, numPages = 1 }) {
  const isPdf = document.document_url?.toLowerCase().includes('.pdf') ||
    document.document_url?.includes('application/pdf');

  const fieldsJson = JSON.stringify(document.fields || []);
  const signerIndexVal = submission.signers.findIndex(s => s.token === token);
  const docHeight = numPages * 1056;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Sign: ${document.title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f3f4f6; min-height: 100vh; }

    .header { background: white; border-bottom: 1px solid #e5e7eb; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-icon { width: 36px; height: 36px; background: #2563eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; }
    .header-title { font-weight: 700; color: #111827; font-size: 15px; }
    .header-subtitle { font-size: 11px; color: #6b7280; }
    .header-signer { text-align: right; font-size: 12px; color: #6b7280; }
    .header-signer strong { color: #111827; display: block; }

    .progress-bar { background: white; border-bottom: 1px solid #e5e7eb; padding: 10px 20px; display: flex; align-items: center; gap: 12px; }
    .progress-text { font-size: 13px; color: #374151; white-space: nowrap; }
    .progress-text span { color: #2563eb; font-weight: 600; }
    .progress-dots { display: flex; gap: 4px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #d1d5db; transition: background 0.3s; }
    .dot.done { background: #22c55e; }

    .instruction { background: #eff6ff; border: 1px solid #bfdbfe; margin: 12px 16px; border-radius: 10px; padding: 10px 14px; font-size: 13px; color: #1d4ed8; }

    /* Document container — doc-inner is the single scroll unit */
    .doc-outer { margin: 0 16px 100px; }
    .doc-container { background: white; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0,0,0,0.06); overflow: visible; }
    /* doc-inner holds everything: iframe + overlays, scrolled by the page, NOT itself */
    .doc-inner { position: relative; width: 100%; height: ${docHeight}px; }
    .doc-inner img { width: 100%; height: 100%; display: block; border-radius: 12px; object-fit: contain; }
    /* iframe fills the full doc-inner height — no internal scroll */
    .doc-inner iframe { position: absolute; inset: 0; width: 100%; height: 100%; display: block; border: none; border-radius: 12px; pointer-events: none; }

    /* Fields sit ON TOP of the document, position absolute inside doc-inner */
    .field-overlay {
      position: absolute;
      cursor: pointer;
      border: 2px dashed #3b82f6;
      background: rgba(219,234,254,0.85);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      transition: background 0.15s;
      z-index: 10;
    }
    .field-overlay:hover { background: rgba(147,197,253,0.9); }
    .field-overlay.signed { border: 2px solid #22c55e; background: rgba(220,252,231,0.7); cursor: default; }
    .field-overlay.text-field { border: 2px dashed #7c3aed; background: rgba(237,233,254,0.85); }
    .field-overlay.text-field.signed { border: 2px solid #d97706; background: rgba(254,252,232,0.92); font-size: 13px; font-weight: 600; color: #1f2937; padding: 2px 6px; justify-content: flex-start; }
    .field-label { font-size: 11px; font-weight: 700; color: #1d4ed8; pointer-events: none; white-space: nowrap; }
    .field-sig-img { width: 100%; height: 100%; object-fit: contain; padding: 2px; }

    .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e5e7eb; padding: 14px 20px; box-shadow: 0 -4px 12px rgba(0,0,0,0.08); z-index: 100; }
    .submit-btn { width: 100%; max-width: 500px; display: block; margin: 0 auto; background: #2563eb; color: white; border: none; border-radius: 10px; padding: 14px; font-size: 16px; font-weight: 700; cursor: pointer; transition: background 0.15s; }
    .submit-btn:hover:not(:disabled) { background: #1d4ed8; }
    .submit-btn:disabled { background: #93c5fd; cursor: not-allowed; }
    .submit-hint { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 6px; }

    .modal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 200; align-items: center; justify-content: center; padding: 16px; }
    .modal-backdrop.open { display: flex; }
    .modal { background: white; border-radius: 16px; width: 100%; max-width: 440px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
    .modal-header { padding: 18px 20px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }
    .modal-title { font-weight: 700; font-size: 16px; color: #111827; }
    .modal-close { background: none; border: none; font-size: 20px; color: #9ca3af; cursor: pointer; line-height: 1; }
    .modal-body { padding: 20px; }
    .mode-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
    .mode-tab { flex: 1; padding: 8px; border-radius: 8px; border: none; font-size: 13px; font-weight: 600; cursor: pointer; background: #f3f4f6; color: #6b7280; transition: all 0.15s; }
    .mode-tab.active { background: #2563eb; color: white; }
    canvas#sigpad { width: 100%; height: 120px; border: 2px dashed #d1d5db; border-radius: 8px; cursor: crosshair; touch-action: none; display: block; background: white; }
    .type-input { width: 100%; padding: 12px 16px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 28px; font-family: Georgia, serif; font-style: italic; color: #1e40af; outline: none; }
    .type-input:focus { border-color: #3b82f6; }
    .clear-link { font-size: 11px; color: #ef4444; background: none; border: none; cursor: pointer; margin-top: 4px; }
    .modal-actions { display: flex; gap: 10px; margin-top: 16px; }
    .btn-cancel { flex: 1; padding: 11px; border-radius: 8px; border: 1px solid #e5e7eb; background: white; color: #374151; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn-accept { flex: 1; padding: 11px; border-radius: 8px; border: none; background: #2563eb; color: white; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn-accept:disabled { background: #93c5fd; cursor: not-allowed; }

    .consent-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; font-size: 13px; color: #4b5563; max-height: 200px; overflow-y: auto; line-height: 1.6; margin-bottom: 14px; }
    .consent-box ul { padding-left: 18px; margin-top: 8px; }
    .consent-box li { margin-bottom: 6px; }
    .consent-signer { font-size: 13px; color: #374151; margin-bottom: 16px; }
    .btn-agree { flex: 2; padding: 13px; border-radius: 8px; border: none; background: #16a34a; color: white; font-size: 15px; font-weight: 700; cursor: pointer; }
    .btn-agree:hover { background: #15803d; }
    .btn-agree.loading { background: #86efac; cursor: not-allowed; }

    .success-screen { display: none; position: fixed; inset: 0; background: white; z-index: 300; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 32px; }
    .success-screen.show { display: flex; }
    .success-icon { font-size: 64px; margin-bottom: 16px; }
    .success-title { font-size: 26px; font-weight: 800; color: #111827; margin-bottom: 8px; }
    .success-sub { font-size: 15px; color: #6b7280; }
    .success-legal { font-size: 11px; color: #9ca3af; margin-top: 24px; max-width: 380px; line-height: 1.5; }
  </style>
</head>
<body>

<div class="header">
  <div class="header-left">
    <div class="header-icon">📄</div>
    <div>
      <div class="header-title">${document.title}</div>
      <div class="header-subtitle">🔒 Secure e-signature</div>
    </div>
  </div>
  <div class="header-signer">
    <span>Signing as</span>
    <strong>${signer.name || signer.email}</strong>
  </div>
</div>

<div class="progress-bar" id="progressBar">
  <div class="progress-text"><span id="doneCount">0</span> of <span id="totalCount">0</span> fields signed</div>
  <div class="progress-dots" id="progressDots"></div>
</div>

<div class="instruction" id="instructionBanner">
  ✏️ Click the highlighted blue fields on the document below to sign or initial.
</div>

<div class="doc-outer">
  <div class="doc-container">
    <div class="doc-inner" id="docInner">
      ${isPdf
        ? `<iframe src="${document.document_url}" title="${document.title}" id="docFrame"></iframe>`
        : `<img src="${document.document_url}" alt="${document.title}" id="docImg" />`
      }
      <!-- Fields injected here by JS, positioned relative to doc-inner -->
    </div>
  </div>
</div>

<div class="bottom-bar">
  <button class="submit-btn" id="submitBtn" disabled onclick="openConsent()">
    ✍️ Finish &amp; Submit Signature
  </button>
  <div class="submit-hint" id="submitHint">Complete all required fields above to continue</div>
</div>

<!-- Signature modal -->
<div class="modal-backdrop" id="sigModal">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title" id="sigModalTitle">Add Your Signature</span>
      <button class="modal-close" onclick="closeSigModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="mode-tabs">
        <button class="mode-tab active" id="tabDraw" onclick="setMode('draw')">Draw</button>
        <button class="mode-tab" id="tabType" onclick="setMode('type')">Type</button>
      </div>
      <div id="drawArea">
        <canvas id="sigpad" width="400" height="120"></canvas>
        <button class="clear-link" onclick="clearCanvas()">Clear</button>
      </div>
      <div id="typeArea" style="display:none">
        <input class="type-input" id="typedSig" type="text" placeholder="Type your full name" oninput="updateAcceptBtn()" />
        <div style="font-size:11px;color:#9ca3af;margin-top:4px">Your typed name will appear as your signature</div>
      </div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="closeSigModal()">Cancel</button>
        <button class="btn-accept" id="acceptBtn" disabled onclick="acceptSignature()">✓ Accept</button>
      </div>
    </div>
  </div>
</div>

<!-- Text/Date field modal -->
<div class="modal-backdrop" id="textFieldModal">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">Enter Value</span>
      <button class="modal-close" onclick="document.getElementById('textFieldModal').classList.remove('open')">✕</button>
    </div>
    <div class="modal-body">
      <input class="type-input" id="textFieldInput" type="text" placeholder="Type here..." style="font-size:16px;font-family:inherit;font-style:normal;" />
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn-cancel" onclick="document.getElementById('textFieldModal').classList.remove('open')">Cancel</button>
        <button class="btn-accept" onclick="acceptTextField()">✓ Confirm</button>
      </div>
    </div>
  </div>
</div>

<!-- Consent modal -->
<div class="modal-backdrop" id="consentModal">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title">🔏 Electronic Signature Disclosure</span>
    </div>
    <div class="modal-body">
      <div class="consent-box">
        <p>By clicking <strong>"I Agree &amp; Sign"</strong>, you consent to the following:</p>
        <ul>
          <li>You are signing <strong>"${document.title}"</strong> electronically.</li>
          <li>Your electronic signature is legally binding and has the same legal effect as a handwritten signature.</li>
          <li>You have had the opportunity to review the document in full before signing.</li>
          <li>You consent to conduct business electronically and receive electronic records.</li>
          <li>Your signature, timestamp, and IP address will be recorded for audit purposes.</li>
        </ul>
        <p style="margin-top:10px;font-size:11px;color:#9ca3af;">This transaction is governed by the Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state laws.</p>
      </div>
      <div class="consent-signer">Signing as: <strong>${signer.name || signer.email}</strong></div>
      <div class="modal-actions">
        <button class="btn-cancel" onclick="closeConsent()">Decline</button>
        <button class="btn-agree" id="agreeBtn" onclick="submitSignatures()">✓ I Agree &amp; Sign</button>
      </div>
    </div>
  </div>
</div>

<!-- Success screen -->
<div class="success-screen" id="successScreen">
  <div class="success-icon">✅</div>
  <div class="success-title">Document Signed!</div>
  <div class="success-sub">Your signature has been recorded successfully.<br/>A confirmation email has been sent to you.</div>
  <div class="success-legal">By signing this document you agreed to the Electronic Signature Disclosure. This signature is legally binding.</div>
</div>

<script>
  const TOKEN = ${JSON.stringify(token)};
  const ALL_FIELDS = ${fieldsJson};
  const SIGNER_INDEX = ${signerIndexVal};
  const IS_PDF = ${isPdf ? 'true' : 'false'};
  const DOC_HEIGHT = ${docHeight};

  const myFields = ALL_FIELDS.filter(f => (f.signer_index ?? 0) === SIGNER_INDEX);
  // Exclude admin pre-filled fields from required (signer doesn't need to fill those)
  const requiredFields = myFields.filter(f => f.required !== false && !(f.value && f.value.trim()));
  const signedData = {};

  let currentField = null;
  let drawMode = 'draw';
  let isDrawing = false;
  let canvas, ctx;

  function init() {
    const docInner = document.getElementById('docInner');
    // Set explicit height on the inner container so % positioning works correctly
    docInner.style.height = DOC_HEIGHT + 'px';

    if (myFields.length === 0) {
      // No fields: show default sign box
      const outer = document.querySelector('.doc-outer');
      const box = document.createElement('div');
      box.style.cssText = 'margin: 12px 0 0; background: white; border-radius: 12px; padding: 20px; border: 1px solid #e5e7eb;';
      box.innerHTML = '<p style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px">Your Signature</p>';
      const btn = document.createElement('div');
      btn.style.cssText = 'border: 2px dashed #3b82f6; border-radius: 8px; padding: 30px; text-align:center; cursor:pointer; background:#eff6ff;';
      btn.innerHTML = '<div style="font-size:24px">✏️</div><div style="font-size:13px;color:#2563eb;font-weight:600;margin-top:6px">Click to add signature</div>';
      btn.id = 'field-default';
      btn.onclick = () => openSigModal({ id: 'default', type: 'signature' });
      box.appendChild(btn);
      outer.appendChild(box);
      updateProgress();
      return;
    }

    placeFields();
    updateProgress();
  }

  function placeFields() {
    const docInner = document.getElementById('docInner');
    myFields.forEach(field => {
      const el = document.createElement('div');
      el.id = 'field-' + field.id;
      el.style.position = 'absolute';
      el.style.left = field.x + '%';
      el.style.top = field.y + '%';
      el.style.width = (field.width || 18) + '%';
      el.style.height = (field.height || 40) + 'px';
      el.style.zIndex = '10';

      // Pre-filled by admin — render as read-only, non-interactive
      if (field.value && field.value.trim()) {
        el.style.cssText += '; background: rgba(254,243,199,0.95); border: 2px solid #f59e0b; border-radius: 4px; display: flex; align-items: center; padding: 0 8px; font-size: 12px; font-weight: 600; color: #111827; pointer-events: none; user-select: none; overflow: hidden;';
        el.textContent = field.value;
        docInner.appendChild(el);
        return;
      }

      // Interactive field for signer
      el.className = 'field-overlay';
      const isTextType = field.type === 'text' || field.type === 'date';
      if (isTextType) el.classList.add('text-field');
      const label = field.type === 'initial' ? 'Initials' : field.type === 'date' ? '📅 Date' : field.type === 'text' ? '✏️ Text' : 'Sign here';
      el.innerHTML = '<span class="field-label">' + (isTextType ? '' : '✏️ ') + label + '</span>';
      el.onclick = () => openSigModal(field);
      docInner.appendChild(el);
    });
  }

  function updateProgress() {
    const done = Object.keys(signedData).length;
    const total = myFields.length === 0 ? 1 : requiredFields.length;
    document.getElementById('doneCount').textContent = done;
    document.getElementById('totalCount').textContent = total;

    const dotsEl = document.getElementById('progressDots');
    dotsEl.innerHTML = requiredFields.map(f =>
      '<div class="dot' + (signedData[f.id] ? ' done' : '') + '"></div>'
    ).join('');

    const allDone = myFields.length === 0
      ? !!signedData['default']
      : requiredFields.every(f => signedData[f.id]);

    document.getElementById('submitBtn').disabled = !allDone;
    document.getElementById('submitHint').style.display = allDone ? 'none' : 'block';
    if (allDone) document.getElementById('instructionBanner').style.display = 'none';
  }

  function openSigModal(field) {
    currentField = field;
    if (field.type === 'text' || field.type === 'date') {
      // Show text/date input modal instead
      const inp = document.getElementById('textFieldInput');
      inp.type = field.type === 'date' ? 'date' : 'text';
      inp.value = field.type === 'date' ? new Date().toISOString().split('T')[0] : '';
      inp.placeholder = field.type === 'date' ? '' : 'Type here...';
      document.getElementById('textFieldModal').classList.add('open');
      setTimeout(() => inp.focus(), 50);
      return;
    }
    const label = field.type === 'initial' ? 'Initials' : 'Signature';
    document.getElementById('sigModalTitle').textContent = 'Add Your ' + label;
    document.getElementById('sigModal').classList.add('open');
    setMode('draw');
    initCanvas();
  }

  function closeSigModal() {
    document.getElementById('sigModal').classList.remove('open');
    currentField = null;
  }

  function setMode(mode) {
    drawMode = mode;
    document.getElementById('drawArea').style.display = mode === 'draw' ? 'block' : 'none';
    document.getElementById('typeArea').style.display = mode === 'type' ? 'block' : 'none';
    document.getElementById('tabDraw').className = 'mode-tab' + (mode === 'draw' ? ' active' : '');
    document.getElementById('tabType').className = 'mode-tab' + (mode === 'type' ? ' active' : '');
    document.getElementById('typedSig').value = '';
    updateAcceptBtn();
    if (mode === 'draw') initCanvas();
  }

  function initCanvas() {
    canvas = document.getElementById('sigpad');
    ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    isDrawing = false;
    document.getElementById('acceptBtn').disabled = true;

    canvas.onmousedown = (e) => { isDrawing = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    canvas.onmousemove = (e) => { if (!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); document.getElementById('acceptBtn').disabled = false; };
    canvas.onmouseup = () => isDrawing = false;
    canvas.onmouseleave = () => isDrawing = false;
    canvas.ontouchstart = (e) => { e.preventDefault(); isDrawing = true; const p = getTouchPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    canvas.ontouchmove = (e) => { e.preventDefault(); if (!isDrawing) return; const p = getTouchPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); document.getElementById('acceptBtn').disabled = false; };
    canvas.ontouchend = () => isDrawing = false;
  }

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
  }

  function getTouchPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.touches[0].clientX - r.left) * canvas.width / r.width, y: (e.touches[0].clientY - r.top) * canvas.height / r.height };
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('acceptBtn').disabled = true;
  }

  function updateAcceptBtn() {
    document.getElementById('acceptBtn').disabled = !document.getElementById('typedSig').value.trim();
  }

  function acceptSignature() {
    let dataUrl;
    if (drawMode === 'type') {
      const name = document.getElementById('typedSig').value.trim();
      if (!name) return;
      const c = document.createElement('canvas');
      c.width = 400; c.height = 100;
      const cx = c.getContext('2d');
      cx.fillStyle = 'white'; cx.fillRect(0, 0, 400, 100);
      cx.fillStyle = '#1e40af';
      cx.font = 'italic 42px Georgia, serif';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(name, 200, 50);
      dataUrl = c.toDataURL();
    } else {
      dataUrl = canvas.toDataURL();
    }

    signedData[currentField.id] = dataUrl;

    const el = document.getElementById('field-' + currentField.id);
    if (el) {
      el.classList.add('signed');
      el.innerHTML = '<img class="field-sig-img" src="' + dataUrl + '" />';
      el.onclick = null;
    }

    closeSigModal();
    updateProgress();
  }

  function acceptTextField() {
    const val = document.getElementById('textFieldInput').value.trim();
    if (!val) return;
    signedData[currentField.id] = val;
    const el = document.getElementById('field-' + currentField.id);
    if (el) {
      el.classList.add('signed');
      el.textContent = val;
      el.onclick = null;
    }
    document.getElementById('textFieldModal').classList.remove('open');
    updateProgress();
  }

  function openConsent() { document.getElementById('consentModal').classList.add('open'); }
  function closeConsent() { document.getElementById('consentModal').classList.remove('open'); }

  async function submitSignatures() {
    const agreeBtn = document.getElementById('agreeBtn');
    agreeBtn.textContent = 'Submitting...';
    agreeBtn.className = 'btn-agree loading';
    agreeBtn.disabled = true;

    try {
      let ipAddress = 'unknown';
      try { const r = await fetch('https://api.ipify.org?format=json'); const d = await r.json(); ipAddress = d.ip; } catch(e) {}

      const fields = Object.entries(signedData).map(([field_id, value]) => ({ field_id, value }));

      const res = await fetch('/api/functions/submitSignature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionToken: TOKEN, signedFields: fields, ipAddress, userAgent: navigator.userAgent }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');

      document.getElementById('consentModal').classList.remove('open');
      document.getElementById('successScreen').classList.add('show');
    } catch(err) {
      agreeBtn.textContent = '✓ I Agree & Sign';
      agreeBtn.className = 'btn-agree';
      agreeBtn.disabled = false;
      alert('Error: ' + err.message);
    }
  }

  window.onload = init;
</script>
</body>
</html>`;
}

function renderAlreadySigned(documentTitle) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Already Signed</title><style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f3f4f6;margin:0;}.card{background:white;border-radius:16px;padding:48px 32px;text-align:center;max-width:420px;box-shadow:0 4px 20px rgba(0,0,0,0.08);}.icon{font-size:56px;margin-bottom:16px;}.title{font-size:22px;font-weight:800;color:#111827;margin-bottom:8px;}.sub{font-size:14px;color:#6b7280;}</style></head><body><div class="card"><div class="icon">✅</div><div class="title">Already Signed</div><div class="sub">You have already signed "${documentTitle}".<br/>You may close this window.</div></div></body></html>`;
}

function renderError(message) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Signing Error</title><style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f3f4f6;margin:0;}.card{background:white;border-radius:16px;padding:48px 32px;text-align:center;max-width:420px;box-shadow:0 4px 20px rgba(0,0,0,0.08);}.icon{font-size:56px;margin-bottom:16px;}.title{font-size:22px;font-weight:800;color:#111827;margin-bottom:8px;}.sub{font-size:14px;color:#6b7280;}</style></head><body><div class="card"><div class="icon">❌</div><div class="title">Signing Error</div><div class="sub">${message}</div></div></body></html>`;
}

export default (async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(renderError('No signing token provided. Please use the link from your email.'), {
        headers: { 'Content-Type': 'text/html' },
        status: 400,
      });
    }

    const base44 = createClientFromRequest(req);

    // Find submission by token (service role - no auth needed)
    const submissions = await base44.asServiceRole.entities.ESignSubmission.list('-created_date', 1000);
    const submission = submissions.find(s => s.signers?.some(sig => sig.token === token));

    if (!submission) {
      return new Response(renderError('Invalid or expired signing link. Please request a new one.'), {
        headers: { 'Content-Type': 'text/html' },
        status: 404,
      });
    }

    const signer = submission.signers.find(s => s.token === token);

    if (signer?.signed) {
      const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: submission.document_id }, '-created_date', 1);
      return new Response(renderAlreadySigned(docs[0]?.title || 'Document'), {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Fetch document
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: submission.document_id }, '-created_date', 1);
    const doc = docs[0];

    if (!doc) {
      return new Response(renderError('Document not found.'), {
        headers: { 'Content-Type': 'text/html' },
        status: 404,
      });
    }

    // Get accessible document URL
    let documentUrl = doc.document_url;
    if (documentUrl && documentUrl.startsWith('/')) {
      try {
        const signedRes = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: documentUrl,
          expires_in: 86400,
        });
        documentUrl = signedRes.signed_url || documentUrl;
      } catch (err) {
        console.error('Failed to create signed URL:', err.message);
      }
    }

    // Detect PDF page count to match editor's coordinate system
    let numPages = 1;
    try {
      const pdfRes = await fetch(documentUrl);
      const arrayBuffer = await pdfRes.arrayBuffer();
      const text = new TextDecoder().decode(arrayBuffer);
      const matches = text.match(/\/Type\s*\/Page[^s]/g) || [];
      numPages = Math.max(1, matches.length);
    } catch (err) {
      console.error('Page count detection failed:', err.message);
    }

    const html = renderSigningPage({
      token,
      submission,
      document: { ...doc, document_url: documentUrl },
      signer,
      numPages,
    });

    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('signingPage error:', error);
    return new Response(renderError('An unexpected error occurred. Please try again.'), {
      headers: { 'Content-Type': 'text/html' },
      status: 500,
    });
  }
});