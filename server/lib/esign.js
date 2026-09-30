// E-sign engine: send signing requests, look up signers by link, check submissions,
// and produce the final signed PDF with a certificate page.
//
// Flow:
//   startSigning()  -> creates the request, emails signers (all, or first if in order)
//   /sign?token=... -> signer fills fields (src/pages/PublicSigner.jsx)
//   recordSignature()-> validates, saves, emails the next signer
//   finalize()      -> stamps every value into the PDF, adds the audit certificate,
//                      stores it privately, emails everyone the signed PDF, and attaches
//                      it to the transaction if there is one

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { adminClient, appUrl } from './base44.js';
import { SendEmail } from './integrations.js';
import { fieldToPdfBox, fieldSignerIndex, isPrefilled } from '../../shared/esignGeometry.js';

export const LINK_DAYS = 30;
const MAX_IMAGE_BYTES = 400_000; // per signature image
const MAX_TEXT = 500;

// ---------------------------------------------------------------------------
// Helpers

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip')) || 'unknown';
}

export function signingLink(token) {
  return `${appUrl()}/sign?token=${encodeURIComponent(token)}`;
}

export async function sha256Hex(bytes) {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Buffer.from(hash).toString('hex');
}

function randomKey() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

export function isExpired(sub) {
  const exp = sub.expires_at || (sub.submitted_at && new Date(new Date(sub.submitted_at).getTime() + LINK_DAYS * 864e5).toISOString());
  return exp ? new Date(exp).getTime() < Date.now() : false;
}

/** In "sign in order" mode, the unsigned signer with the lowest order. */
export function whoseTurn(sub) {
  const unsigned = (sub.signers || []).filter((s) => !s.signed);
  if (sub.sequence_type !== 'sequential') return unsigned;
  const next = [...unsigned].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
  return next ? [next] : [];
}

export async function audit(entities, { document_id, action, signer_email, details, ip_address, user_agent }) {
  try {
    await entities.ESignAuditLog.create({ document_id, action, signer_email, details, ip_address, user_agent });
  } catch (err) {
    console.error('audit log failed:', err.message);
  }
}

/** Finds the signing request that owns a signer link. Indexed lookup, no scanning. */
export async function findByToken(entities, token) {
  if (!token || typeof token !== 'string' || token.length < 16) return null;
  const token_hash = await hashToken(token);
  let [sub] = await entities.ESignSubmission.filter({ signers: [{ token_hash }] }, '-created_date', 1);
  // Requests sent before the migration stored the link code as-is.
  if (!sub) [sub] = await entities.ESignSubmission.filter({ signers: [{ token }] }, '-created_date', 1);
  return sub || null;
}

// ---------------------------------------------------------------------------
// Signer link codes
//
// The code in a signer's link is never stored as-is: the database keeps a hash (to find
// the request) and an encrypted copy (so reminders can re-send the same link). Agents
// who can read signing requests in the app therefore can't open a client's link.

async function tokenKey() {
  const secret = process.env.SIGNING_TOKEN_SECRET || process.env.HOOK_SECRET;
  if (!secret) throw new Error('SIGNING_TOKEN_SECRET is not set');
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`esign:${secret}`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function hashToken(token) {
  return sha256Hex(new TextEncoder().encode(`esign-token:${token}`));
}

async function sealToken(token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(), new TextEncoder().encode(token)));
  return Buffer.concat([Buffer.from(iv), Buffer.from(ct)]).toString('base64');
}

export async function tokenOf(signer) {
  if (signer.token) return signer.token; // legacy
  const buf = Buffer.from(signer.token_enc, 'base64');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(0, 12) }, await tokenKey(), buf.subarray(12));
  return new TextDecoder().decode(pt);
}

/** Stable id for comparing signers (hash for new requests, raw code for old ones). */
export const signerKey = (s) => s.token_hash || s.token;

export async function newSignerCode() {
  const token = randomKey();
  return { token, token_hash: await hashToken(token), token_enc: await sealToken(token) };
}

export async function matchSigner(sub, token) {
  const h = await hashToken(token);
  return sub.signers.findIndex((s) => s.token_hash === h || (s.token && s.token === token));
}

// ---------------------------------------------------------------------------
// Email

function shell(title, inner) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <div style="background:#1e3a5f;border-radius:10px 10px 0 0;padding:18px 22px;color:#fff;font-size:18px;font-weight:bold;">${esc(title)}</div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px;padding:22px;line-height:1.55;font-size:15px;">
    ${inner}
  </div>
  <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:14px;">Sent by Guru Broker E-Sign. Electronic signatures under the federal E-SIGN Act.</p>
</div></body></html>`;
}

function button(href, label, color = '#2563eb') {
  return `<p style="margin:24px 0;"><a href="${esc(href)}" style="display:inline-block;padding:13px 26px;background:${color};color:#fff;text-decoration:none;border-radius:7px;font-weight:bold;">${esc(label)}</a></p>`;
}

export async function emailSigner({ sub, doc, signer, reminder = false }) {
  const link = signingLink(await tokenOf(signer));
  const from = sub.created_by_name || 'Your agent';
  const inner = `
    <p>Hi ${esc(signer.name || signer.email)},</p>
    <p>${reminder ? 'Friendly reminder: ' : ''}<strong>${esc(from)}</strong> ${reminder ? 'is still waiting on' : 'sent you'} a document to sign:</p>
    <p style="font-size:16px;"><strong>${esc(doc.title)}</strong></p>
    ${sub.message ? `<div style="background:#f9fafb;border-left:3px solid #2563eb;padding:10px 14px;margin:14px 0;white-space:pre-wrap;">${esc(sub.message)}</div>` : ''}
    ${button(link, 'Review & sign')}
    <p style="font-size:12px;color:#6b7280;">This link is just for you, so please don't forward it. It works for ${LINK_DAYS} days.<br/>If the button doesn't work, paste this into your browser:<br/>${esc(link)}</p>`;
  await SendEmail({
    to: signer.email,
    subject: `${reminder ? 'Reminder: ' : ''}Please sign "${doc.title}"`,
    body: shell('Signature requested', inner),
    from_name: `${from} via Guru Broker`,
    reply_to: sub.created_by_email || undefined,
  });
}

// ---------------------------------------------------------------------------
// Start

/**
 * Creates a signing request for a document and emails the signers.
 * signers: [{ name, email }] in signing order.
 */
export async function startSigning({ entities, doc, signers, sequenceType, transactionId, sender, message, req }) {
  const valid = (signers || []).filter((s) => s && typeof s.email === 'string' && /\S+@\S+\.\S+/.test(s.email));
  const clean = [];
  for (const [i, s] of valid.entries()) {
    const { token_hash, token_enc } = await newSignerCode();
    clean.push({
      email: s.email.trim().toLowerCase(),
      name: (s.name || s.email.split('@')[0]).trim(),
      order: i + 1,
      token_hash,
      token_enc,
      signed: false,
      signed_at: null,
    });
  }
  if (!clean.length) throw Object.assign(new Error('Add at least one signer with a valid email.'), { status: 400 });

  // Remember which of the document's signers each person is, so their fields stay
  // theirs even if their email address is corrected later.
  const docSigners = Array.isArray(doc.signers) ? doc.signers : [];
  clean.forEach((s, i) => {
    const byEmail = docSigners.findIndex((d) => String(d.email || '').toLowerCase() === s.email);
    s.doc_index = byEmail >= 0 ? byEmail : i;
  });

  const sequential = sequenceType === 'sequential';
  const now = new Date();
  const sub = await entities.ESignSubmission.create({
    document_id: doc.id,
    brokerage_id: doc.brokerage_id,
    transaction_id: transactionId || doc.transaction_id || null,
    created_by_email: sender?.email || null,
    created_by_name: sender?.full_name || sender?.name || null,
    status: 'pending',
    sequence_type: sequential ? 'sequential' : 'all_at_once',
    signers: clean,
    submitted_at: now.toISOString(),
    completed_at: null,
    // stored in `extra`
    expires_at: new Date(now.getTime() + LINK_DAYS * 864e5).toISOString(),
    access_key: randomKey(),
    message: message ? String(message).slice(0, 2000) : null,
  });

  // Fields refer to signers by their position in doc.signers, so never reorder that list.
  // Only fill it in if the document doesn't have one yet.
  await entities.ESignDocument.update(doc.id, {
    status: 'pending',
    ...(Array.isArray(doc.signers) && doc.signers.length ? {} : { signers: clean.map(({ token_hash, token_enc, ...rest }) => rest) }),
  });

  const first = whoseTurn(sub);
  for (const s of first) {
    try {
      await emailSigner({ sub, doc, signer: s });
      s.notified_at = new Date().toISOString();
    } catch (err) {
      console.error('Signer email failed:', s.email, err.message);
    }
  }
  const signersNow = sub.signers.map((s) => first.find((f) => signerKey(f) === signerKey(s)) || s);
  await entities.ESignSubmission.update(sub.id, { signers: signersNow });

  await audit(entities, {
    document_id: doc.id,
    action: 'sent',
    details: `Sent to ${clean.map((s) => s.email).join(', ')}${sequential ? ' (in order)' : ''} by ${sender?.email || 'system'}`,
    ip_address: req ? clientIp(req) : null,
  });
  return { ...sub, signers: signersNow };
}

// ---------------------------------------------------------------------------
// Sign

/**
 * Validates and records one signer's values. Returns { sub, completed }.
 * Throws with .status on anything invalid.
 */
export async function recordSignature({ entities, token, signedFields, req, userAgent }) {
  const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
  const sub = await findByToken(entities, token);
  if (!sub) fail('This signing link is not valid. Ask the sender for a new one.', 404);
  if (sub.status === 'voided') fail('This signing request was cancelled by the sender.', 410);
  if (sub.status === 'completed') fail('This document has already been completed.', 409);
  if (isExpired(sub)) fail('This signing link has expired. Ask the sender to resend it.', 410);

  const idx = await matchSigner(sub, token);
  const signer = sub.signers[idx];
  if (signer.signed) fail('You have already signed this document.', 409);
  if (!whoseTurn(sub).some((s) => signerKey(s) === signerKey(signer))) fail("It's not your turn to sign yet.", 409);

  const [doc] = await entities.ESignDocument.filter({ id: sub.document_id }, '-created_date', 1);
  if (!doc) fail('Document not found.', 404);

  // Fields this signer owns (by position in the document's signer list).
  const docSignerIdx = signerIndexInDoc(doc, sub, signer);
  const mine = (doc.fields || []).filter((f) => fieldSignerIndex(f) === docSignerIdx && !isPrefilled(f));
  const byId = new Map((Array.isArray(signedFields) ? signedFields : []).map((f) => [String(f.field_id), f.value]));

  const values = [];
  const check = (field, value) => {
    if (value == null || value === '') {
      if (field.required !== false) fail('Please complete every required field before submitting.');
      return;
    }
    if (field.type === 'signature' || field.type === 'initial') {
      if (typeof value !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(value)) fail('A signature could not be read. Please sign again.');
      if (value.length * 0.75 > MAX_IMAGE_BYTES) fail('A signature image is too large. Please sign again.');
    } else if (typeof value !== 'string' || value.length > MAX_TEXT) {
      fail('A text field is too long.');
    }
    values.push({ field_id: field.id, value });
  };

  if (mine.length === 0) {
    check({ id: 'default', type: 'signature', required: true }, byId.get('default'));
  } else {
    for (const f of mine) check(f, byId.get(String(f.id)));
  }

  const ip = clientIp(req);
  const ua = String(userAgent || req.headers.get('user-agent') || '').slice(0, 400);
  const signedAt = new Date().toISOString();

  await entities.SignatureData.create({
    submission_id: sub.id,
    signer_email: signer.email,
    signer_name: signer.name,
    fields: values,
    signed_at: signedAt,
    ip_address: ip,
    user_agent: ua,
  });

  const signers = sub.signers.map((s, i) => (i === idx ? { ...s, signed: true, signed_at: signedAt, ip_address: ip, user_agent: ua } : s));
  const completed = signers.every((s) => s.signed);
  const updated = await entities.ESignSubmission.update(sub.id, {
    signers,
    status: completed ? 'completed' : 'in_progress',
    completed_at: completed ? signedAt : null,
  });

  await audit(entities, { document_id: doc.id, action: 'signed', signer_email: signer.email, details: `Signed ${values.length} field(s)`, ip_address: ip, user_agent: ua });

  // Keep the document's own signer list in step for the dashboards.
  const signedByEmail = new Map(signers.map((s) => [s.email.toLowerCase(), s]));
  await entities.ESignDocument.update(doc.id, {
    status: completed ? 'completed' : 'pending',
    signers: (doc.signers || []).map((d) => {
      const s = signedByEmail.get(String(d.email || '').toLowerCase());
      return s ? { ...d, signed: s.signed, signed_at: s.signed_at } : d;
    }),
  }).catch(() => {});

  if (!completed) {
    // In order: email whoever is next.
    for (const next of whoseTurn(updated)) {
      if (next.notified_at) continue;
      try {
        await emailSigner({ sub: updated, doc, signer: next });
        next.notified_at = new Date().toISOString();
      } catch (err) {
        console.error('Next-signer email failed:', err.message);
      }
    }
    await entities.ESignSubmission.update(sub.id, { signers: updated.signers });
  }

  return { sub: updated, doc, signer, completed };
}

/** Maps a submission signer to the index used by the document's fields. */
export function signerIndexInDoc(doc, sub, signer) {
  if (Number.isInteger(signer.doc_index)) return signer.doc_index;
  const list = doc.signers || [];
  const byEmail = list.findIndex((s) => (s.email || '').toLowerCase() === signer.email.toLowerCase());
  if (byEmail >= 0) return byEmail;
  return sub.signers.findIndex((s) => signerKey(s) === signerKey(signer));
}

// ---------------------------------------------------------------------------
// Finish: build the signed PDF

// The built-in PDF fonts only cover basic Latin, so swap common typographic characters.
const ASCII = (s) => String(s ?? '')
  .replace(/[\u2018\u2019\u2032]/g, "'")
  .replace(/[\u201C\u201D\u2033]/g, '"')
  .replace(/[\u2013\u2014\u2212]/g, '-')
  .replace(/\u2026/g, '...')
  .replace(/\u00A0/g, ' ')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, '?');

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the original document (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

function isPdfBytes(bytes) {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

async function embedImage(pdf, dataUrl) {
  const [, meta, b64] = dataUrl.match(/^data:([^;]+);base64,(.*)$/) || [];
  if (!b64) return null;
  const bytes = Buffer.from(b64, 'base64');
  return meta === 'image/jpeg' ? pdf.embedJpg(bytes) : pdf.embedPng(bytes);
}

function fitText(font, text, maxWidth, maxHeight) {
  let size = Math.min(12, maxHeight * 0.7);
  while (size > 5 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

/**
 * Builds the signed PDF. Returns { bytes, originalHash, finalHash }.
 * Exported separately so it can be tested without a database.
 */
export async function buildSignedPdf({ originalBytes, doc, sub, signatureData, events = [] }) {
  const originalHash = await sha256Hex(originalBytes);
  let pdf;
  if (isPdfBytes(originalBytes)) {
    pdf = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  } else {
    pdf = await PDFDocument.create();
    const isPng = originalBytes[0] === 0x89 && originalBytes[1] === 0x50;
    const img = isPng ? await pdf.embedPng(originalBytes) : await pdf.embedJpg(originalBytes);
    const page = pdf.addPage([612, (612 * img.height) / img.width]);
    page.drawImage(img, { x: 0, y: 0, width: 612, height: (612 * img.height) / img.width });
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const docPages = pdf.getPages();
  const sizes = docPages.map((p) => {
    const box = p.getCropBox?.() || { width: p.getWidth(), height: p.getHeight(), x: 0, y: 0 };
    return { width: box.width, height: box.height, x: box.x || 0, y: box.y || 0 };
  });

  // Every value by field id.
  const values = {};
  const defaultSigs = [];
  for (const sd of signatureData) {
    for (const f of sd.fields || []) {
      if (f.field_id === 'default') defaultSigs.push({ signer: sd, value: f.value });
      else values[f.field_id] = f.value;
    }
  }

  for (const field of doc.fields || []) {
    const value = isPrefilled(field) ? field.value : values[field.id];
    if (!value) continue;
    const box = fieldToPdfBox(field, sizes);
    const page = docPages[box.pageIndex];
    const origin = sizes[box.pageIndex];
    const x = origin.x + box.x;
    const y = origin.y + box.y;
    if ((field.type === 'signature' || field.type === 'initial') && String(value).startsWith('data:image')) {
      const img = await embedImage(pdf, value);
      if (!img) continue;
      const scale = Math.min(box.width / img.width, box.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: x + (box.width - w) / 2, y: y + (box.height - h) / 2, width: w, height: h });
    } else {
      const text = ASCII(value);
      const size = fitText(font, text, box.width - 4, box.height);
      page.drawText(text, { x: x + 2, y: y + (box.height - size) / 2 + size * 0.2, size, font, color: rgb(0.07, 0.09, 0.15) });
    }
  }

  // Certificate of completion.
  let cert = pdf.addPage([612, 792]);
  let cy = 740;
  const line = (text, opts = {}) => {
    if (cy < 60) { cert = pdf.addPage([612, 792]); cy = 740; }
    cert.drawText(ASCII(text), { x: opts.x || 50, y: cy, size: opts.size || 10, font: opts.bold ? bold : font, color: opts.color || rgb(0.15, 0.17, 0.22) });
    cy -= opts.gap || 15;
  };
  line('Certificate of Completion', { size: 18, bold: true, gap: 26 });
  line(`Document: ${doc.title || 'Document'}`, { bold: true });
  line(`Document ID: ${doc.id}    Request ID: ${sub.id}`);
  line(`Sent by: ${sub.created_by_name || ''} <${sub.created_by_email || ''}>`);
  line(`Sent: ${fmt(sub.submitted_at)}    Completed: ${fmt(sub.completed_at || new Date().toISOString())}`);
  line(`Signing order: ${sub.sequence_type === 'sequential' ? 'In order' : 'Any order'}`);
  line(`Original document SHA-256: ${originalHash}`, { size: 8, gap: 24 });

  line('Signers', { size: 13, bold: true, gap: 20 });
  for (const s of sub.signers || []) {
    const sd = signatureData.find((d) => d.signer_email === s.email);
    line(`${s.name || ''} <${s.email}>`, { bold: true });
    line(`Signed: ${fmt(s.signed_at)}    IP address: ${s.ip_address || sd?.ip_address || 'unknown'}`, { x: 62 });
    line(`Device: ${(s.user_agent || sd?.user_agent || 'unknown').slice(0, 95)}`, { x: 62, size: 8 });
    const def = defaultSigs.find((d) => d.signer.signer_email === s.email);
    if (def) {
      const img = await embedImage(pdf, def.value);
      if (img) {
        if (cy < 110) { cert = pdf.addPage([612, 792]); cy = 740; }
        const scale = Math.min(180 / img.width, 45 / img.height);
        cert.drawImage(img, { x: 62, y: cy - 40, width: img.width * scale, height: img.height * scale });
        cy -= 50;
      }
    }
    cy -= 6;
  }

  if (events.length) {
    line('Activity', { size: 13, bold: true, gap: 20 });
    for (const e of events) {
      line(`${fmt(e.created_date)}  ${e.action}${e.signer_email ? `  ${e.signer_email}` : ''}${e.ip_address ? `  IP ${e.ip_address}` : ''}`, { size: 8, gap: 12 });
    }
  }
  cy -= 10;
  line('Each signer agreed to use electronic signatures and records before signing (E-SIGN Act, 15 U.S.C. 7001).', { size: 8, gap: 12 });
  line('The SHA-256 fingerprint above identifies the exact document that was sent for signature.', { size: 8 });

  pdf.setTitle(`${doc.title || 'Document'} (signed)`);
  pdf.setProducer('Guru Broker E-Sign');
  const bytes = await pdf.save();
  return { bytes, originalHash, finalHash: await sha256Hex(bytes) };
}

function fmt(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'long' });
}

export function signedDocLink(sub) {
  return `${appUrl()}/api/fn/viewSignedDocument?submission_id=${encodeURIComponent(sub.id)}&key=${encodeURIComponent(sub.access_key || '')}`;
}

/** Generates, stores and distributes the signed PDF. Safe to call more than once. */
export async function finalize({ entities, sub, doc }) {
  const signatureData = await entities.SignatureData.filter({ submission_id: sub.id }, 'created_date', 100);
  const events = await entities.ESignAuditLog.filter({ document_id: doc.id }, 'created_date', 200).catch(() => []);
  const originalBytes = await fetchBytes(doc.original_document_url || doc.document_url);
  const { bytes, originalHash, finalHash } = await buildSignedPdf({ originalBytes, doc, sub, signatureData, events });

  const path = `signed/${sub.id}.pdf`;
  const { error } = await adminClient().storage.from('private-files')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Could not store the signed PDF: ${error.message}`);

  const accessKey = sub.access_key || randomKey();
  const link = signedDocLink({ ...sub, access_key: accessKey });
  const updated = await entities.ESignSubmission.update(sub.id, {
    signed_document_url: link,
    signed_pdf_path: `private-files/${path}`,
    original_sha256: originalHash,
    final_sha256: finalHash,
    access_key: accessKey,
  });
  await entities.ESignDocument.update(doc.id, {
    status: 'completed',
    final_signed_document_url: link,
    document_hash: originalHash,
  }).catch(() => {});

  // Attach to the transaction's documents.
  if (sub.transaction_id) {
    try {
      const tx = await entities.Transaction.get(sub.transaction_id);
      const docs = Array.isArray(tx.documents) ? tx.documents : [];
      if (!docs.some((d) => d.submission_id === sub.id)) {
        docs.push({ name: `${doc.title} (signed)`, url: link, submission_id: sub.id, uploaded_at: new Date().toISOString(), uploaded_by: 'E-Sign' });
      }
      const esignDocs = (Array.isArray(tx.esign_docs) ? tx.esign_docs : []).map((d) =>
        d.submission_id === sub.id ? { ...d, status: 'completed' } : d);
      await entities.Transaction.update(tx.id, { documents: docs, esign_docs: esignDocs });
    } catch (err) {
      console.error('Could not attach to transaction:', err.message);
    }
  }

  // Put the signed copy on the checklist item it was sent from.
  if (doc.checklist_id && doc.checklist_item_id) {
    try {
      const [cl] = await entities.Checklist.filter({ id: doc.checklist_id }, '-created_date', 1);
      if (cl && cl.brokerage_id === doc.brokerage_id) {
        const at = new Date().toISOString();
        const items = (cl.items || []).map((i) => (i.id !== doc.checklist_item_id ? i : {
          ...i, document_url: link, document_name: `${doc.title} (signed)`, uploaded_by: 'e-sign', uploaded_at: at,
          status: ['approved', 'review_requested'].includes(i.status) ? i.status : 'uploaded',
          history: [...(i.history || []), { at, by: 'e-sign', what: 'signed copy attached' }],
        }));
        await entities.Checklist.update(cl.id, { items });
      }
    } catch (err) {
      console.error('Could not attach to checklist:', err.message);
    }
  }

  // Email everyone the signed PDF.
  const filename = `${ASCII(doc.title || 'Document').replace(/[^A-Za-z0-9 ._-]/g, '').trim() || 'Document'} - signed.pdf`;
  const attach = bytes.length < 9_000_000 ? [{ filename, content: Buffer.from(bytes).toString('base64') }] : undefined;
  const recipients = new Map();
  if (sub.created_by_email) recipients.set(sub.created_by_email.toLowerCase(), sub.created_by_name || 'there');
  for (const s of sub.signers) recipients.set(s.email.toLowerCase(), s.name || s.email);
  for (const [email, name] of recipients) {
    try {
      await SendEmail({
        to: email,
        subject: `Completed: "${doc.title}" is fully signed`,
        body: shell('Document completed', `
          <p>Hi ${esc(name)},</p>
          <p>Everyone has signed <strong>${esc(doc.title)}</strong>. ${attach ? 'The signed PDF is attached.' : ''}</p>
          ${button(link, 'Download signed PDF', '#16a34a')}
          <p style="font-size:12px;color:#6b7280;">The last page is a certificate listing each signer, when they signed and from where.</p>`),
        from_name: 'Guru Broker E-Sign',
        attachments: attach,
      });
    } catch (err) {
      console.error('Completion email failed:', email, err.message);
    }
  }
  await audit(entities, { document_id: doc.id, action: 'completed', details: `Signed PDF generated (SHA-256 ${finalHash})` });
  return updated;
}
