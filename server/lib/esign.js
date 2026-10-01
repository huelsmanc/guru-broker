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
import { fieldToPdfBox, fieldSignerIndex, isPrefilled, TEXT_PT, fieldVisible, isTickType } from '../../shared/esignGeometry.js';
import { readFileBytes, pathFromUrl, parsePath } from './files.js';
import qrcodegen from './vendor/qrcodegen.js';

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

// ---------------------------------------------------------------------------
// One-time email codes (when the sender asks signers to confirm who they are)

async function proofKey() {
  const secret = process.env.SIGNING_TOKEN_SECRET || process.env.HOOK_SECRET;
  if (!secret) throw new Error('SIGNING_TOKEN_SECRET is not set');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(`esign-proof:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
/** What the signer's browser keeps after entering the right code. */
export async function makeProof(signer) {
  const mac = await crypto.subtle.sign('HMAC', await proofKey(), new TextEncoder().encode(`${signerKey(signer)}:${signer.verified_at}`));
  return Buffer.from(mac).toString('base64url');
}
/** True when no code is needed, or the browser's proof is right. */
export async function codeOk(sub, signer, proof) {
  if (sub.verify !== 'email') return true;
  if (!signer.verified_at || !proof || typeof proof !== 'string') return false;
  return proof === (await makeProof(signer));
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
export async function startSigning({ entities, doc, signers, sequenceType, transactionId, sender, message, req, options = {} }) {
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
    // Options: a one-time code by email before opening, and how often to remind.
    verify: options.verify === 'email' ? 'email' : null,
    remind_days: Number.isFinite(Number(options.remindDays)) ? Math.max(0, Math.min(14, Number(options.remindDays))) : 2,
    // Where files signers attach are kept (the deal, or the sender's own folder).
    attach_scope: (transactionId || doc.transaction_id) ? { kind: 'tx', id: transactionId || doc.transaction_id } : (sender?.id ? { kind: 'user', id: sender.id } : null),
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
export async function recordSignature({ entities, token, signedFields, req, userAgent, proof }) {
  const fail = (msg, status = 400) => { throw Object.assign(new Error(msg), { status }); };
  const sub = await findByToken(entities, token);
  if (!sub) fail('This signing link is not valid. Ask the sender for a new one.', 404);
  if (sub.status === 'voided') fail('This signing request was cancelled by the sender.', 410);
  if (sub.status === 'completed') fail('This document has already been completed.', 409);
  if (isExpired(sub)) fail('This signing link has expired. Ask the sender to resend it.', 410);

  const idx = await matchSigner(sub, token);
  const signer = sub.signers[idx];
  if (signer.signed) fail('You have already signed this document.', 409);
  if (!(await codeOk(sub, signer, proof))) fail('Please enter the code we emailed you first.', 401);
  if (!whoseTurn(sub).some((s) => signerKey(s) === signerKey(signer))) fail("It's not your turn to sign yet.", 409);

  const [doc] = await entities.ESignDocument.filter({ id: sub.document_id }, '-created_date', 1);
  if (!doc) fail('Document not found.', 404);

  // Fields this signer owns (by position in the document's signer list).
  const docSignerIdx = signerIndexInDoc(doc, sub, signer);
  const mine = (doc.fields || []).filter((f) => fieldSignerIndex(f) === docSignerIdx && !isPrefilled(f));
  const byId = new Map((Array.isArray(signedFields) ? signedFields : []).map((f) => [String(f.field_id), f.value]));
  // Values as the signer sees them (for "only show when..." fields).
  const seen = {};
  for (const f of doc.fields || []) seen[f.id] = isPrefilled(f) ? f.value : byId.get(String(f.id));
  const attachFolder = sub.attach_scope || null;

  const values = [];
  const check = (field, value) => {
    if (!fieldVisible(field, seen)) return; // hidden by its condition: ignored
    if (isTickType(field.type) && value !== 'X') value = '';
    if (value == null || value === '') {
      if (field.type === 'radio') {
        // A choose-one group is complete when any option in it is picked.
        const group = mine.filter((g) => g.type === 'radio' && (g.group || 'group') === (field.group || 'group') && fieldVisible(g, seen));
        if (group.some((g) => g.required !== false) && !group.some((g) => byId.get(String(g.id)) === 'X')) fail('Please choose an option in every group.');
        return;
      }
      if (field.required === true || (field.required !== false && field.type !== 'checkbox')) fail('Please complete every required field before submitting.');
      return;
    }
    if (field.type === 'signature' || field.type === 'initial') {
      if (typeof value !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(value)) fail('A signature could not be read. Please sign again.');
      if (value.length * 0.75 > MAX_IMAGE_BYTES) fail('A signature image is too large. Please sign again.');
    } else if (field.type === 'dropdown') {
      if (!(field.options || []).includes(value)) fail('Please choose one of the listed options.');
    } else if (field.type === 'attachment') {
      // Only files uploaded through this signing link, into this request's folder.
      const info = parsePath(pathFromUrl(value));
      const ok = info && attachFolder && info.kind === attachFolder.kind && info.id === attachFolder.id && info.brokerageId === (sub.brokerage_id || doc.brokerage_id) && /\/esign-/.test(pathFromUrl(value));
      if (!ok) fail('An attached file could not be found. Please attach it again.');
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

  await audit(entities, { document_id: doc.id, action: 'signed', signer_email: signer.email, details: `Signed ${values.length} field(s)${signer.in_person_by ? ` in person (hosted by ${signer.in_person_by})` : ''}`, ip_address: ip, user_agent: ua });
  if (sub.created_by_email && !completed) {
    try {
      const { notifyPeople } = await import('./team.js');
      const left = signers.filter((s) => !s.signed).length;
      await notifyPeople(entities, {
        brokerageId: sub.brokerage_id || doc.brokerage_id, people: [{ email: sub.created_by_email, full_name: sub.created_by_name }],
        title: `${signer.name || signer.email} signed "${doc.title}"`, message: `${left} signer${left === 1 ? '' : 's'} to go.`,
        link: '/ESignDocuments', referenceId: sub.id, referenceType: 'ESign', email: false, pushKind: 'esign',
      });
    } catch (err) { console.error('signed notification failed:', err.message); }
  }

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
  try { return await readFileBytes(url); } catch (err) { throw new Error(`Could not download the original document (${err.message})`); }
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

/** File name from an attachment link (/api/file?p=.../<stamp>-<rand>-name.pdf). */
export function attachmentName(url) {
  const p = pathFromUrl(url) || String(url || '');
  return (p.split('/').pop() || 'file').replace(/^esign-[a-z0-9]+-[a-z0-9]+-/i, '').replace(/^[a-z0-9]+-[a-z0-9]+-/i, '');
}

function wrapText(font, text, size, maxWidth) {
  const out = [];
  for (const para of String(text).split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word;
      // A single word wider than the box is broken up.
      while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > maxWidth) n -= 1;
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, n)); w = w.slice(n);
      }
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
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
export async function buildSignedPdf({ originalBytes, doc, sub, signatureData, events = [], verifyUrl }) {
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
  const attachments = [];
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
    if (field.type === 'strike') {
      // The sender's strike-out: a line through the middle of the box.
      const b = fieldToPdfBox(field, sizes);
      const o = sizes[b.pageIndex];
      const midY = o.y + b.y + b.height / 2;
      docPages[b.pageIndex].drawLine({ start: { x: o.x + b.x, y: midY }, end: { x: o.x + b.x + b.width, y: midY }, thickness: 1.2, color: rgb(0.07, 0.09, 0.15) });
      continue;
    }
    const value = isPrefilled(field) ? field.value : values[field.id];
    if (!value) continue;
    const box = fieldToPdfBox(field, sizes);
    const page = docPages[box.pageIndex];
    const origin = sizes[box.pageIndex];
    const x = origin.x + box.x;
    const y = origin.y + box.y;
    if (isTickType(field.type)) {
      // A tick mark, sized to the box.
      if (value !== 'X') continue;
      const s = Math.max(5, Math.min(box.height, box.width) * 0.8);
      const cx = x + (box.width - s) / 2;
      const cy = y + (box.height - s) / 2;
      const ink = { thickness: Math.max(1, s / 7), color: rgb(0.07, 0.09, 0.15) };
      page.drawLine({ start: { x: cx + s * 0.08, y: cy + s * 0.5 }, end: { x: cx + s * 0.38, y: cy + s * 0.15 }, ...ink });
      page.drawLine({ start: { x: cx + s * 0.38, y: cy + s * 0.15 }, end: { x: cx + s * 0.95, y: cy + s * 0.9 }, ...ink });
      continue;
    }
    if (field.type === 'attachment') {
      const name = attachmentName(value);
      attachments.push({ name, field });
      const text = ASCII(`Attached: ${name}`);
      const size = fitText(font, text, box.width - 4, box.height);
      page.drawText(text, { x: x + 2, y: y + (box.height - size) / 2 + size * 0.2, size, font, color: rgb(0.1, 0.2, 0.55) });
      continue;
    }
    if ((field.type === 'signature' || field.type === 'initial') && String(value).startsWith('data:image')) {
      const img = await embedImage(pdf, value);
      if (!img) continue;
      const scale = Math.min(box.width / img.width, box.height / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      page.drawImage(img, { x: x + (box.width - w) / 2, y: y + (box.height - h) / 2, width: w, height: h });
    } else if (field.type === 'text' && (String(value).includes('\n') || font.widthOfTextAtSize(ASCII(value), Math.min(TEXT_PT * (sizes[box.pageIndex].width / 612), box.height * 0.7)) > box.width - 4)) {
      // Longer text wraps onto more lines, from the top of the box (the editor grows the box to fit).
      let size = Math.min(TEXT_PT * (sizes[box.pageIndex].width / 612), 14);
      const clean = String(value).split(/\r?\n/).map(ASCII).join('\n');
      let lines = wrapText(font, clean, size, box.width - 6);
      while (size > 5 && lines.length * size * 1.2 > box.height + size * 0.3) { size -= 0.5; lines = wrapText(font, clean, size, box.width - 6); }
      lines.forEach((ln, i) => page.drawText(ln, { x: x + 3, y: y + box.height - size * (1 + i * 1.2) - 1, size, font, color: rgb(0.07, 0.09, 0.15) }));
    } else {
      const text = ASCII(value);
      const size = fitText(font, text, box.width - 4, box.height);
      page.drawText(text, { x: x + 2, y: y + (box.height - size) / 2 + size * 0.2, size, font, color: rgb(0.07, 0.09, 0.15) });
    }
  }

  const docPageCount = pdf.getPageCount();
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
  line(`Original document SHA-256: ${originalHash}`, { size: 8, gap: verifyUrl ? 14 : 24 });
  if (verifyUrl) {
    // Scan to check this copy against the record kept by the app.
    const qr = qrcodegen.QrCode.encodeText(verifyUrl, qrcodegen.QrCode.Ecc.MEDIUM);
    const size = 78; const cell = size / (qr.size + 8); const qx = 612 - 50 - size; const qy = 740 - size + 10;
    cert.drawRectangle({ x: qx, y: qy, width: size, height: size, color: rgb(1, 1, 1) });
    for (let r = 0; r < qr.size; r++) for (let c = 0; c < qr.size; c++) {
      if (qr.getModule(c, r)) cert.drawRectangle({ x: qx + (c + 4) * cell, y: qy + size - (r + 5) * cell, width: cell + 0.05, height: cell + 0.05, color: rgb(0, 0, 0) });
    }
    line(`Verify this document: ${verifyUrl}`, { size: 8, gap: 12 });
    line('This file is digitally sealed. Any change after signing shows as invalid in Adobe Reader.', { size: 8, gap: 22 });
  }

  line('Signers', { size: 13, bold: true, gap: 20 });
  for (const s of sub.signers || []) {
    const sd = signatureData.find((d) => d.signer_email === s.email);
    line(`${s.name || ''} <${s.email}>`, { bold: true });
    line(`Signed: ${fmt(s.signed_at)}    IP address: ${s.ip_address || sd?.ip_address || 'unknown'}`, { x: 62 });
    line(`Device: ${(s.user_agent || sd?.user_agent || 'unknown').slice(0, 95)}`, { x: 62, size: 8 });
    if (s.verified_at && !s.in_person_by) line('Identity: entered a one-time code sent to this email', { x: 62, size: 8 });
    if (s.in_person_by) line(`Signed in person, hosted by ${s.in_person_by}`, { x: 62, size: 8 });
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

  if (attachments.length) {
    line('Files attached by signers', { size: 13, bold: true, gap: 20 });
    for (const a of attachments) line(`- ${a.name}`, { size: 9, gap: 13 });
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
  return { bytes, originalHash, finalHash: await sha256Hex(bytes), docPageCount };
}

/** The signed PDF without its certificate pages (the first `pages` pages only). */
export async function withoutCertificate(bytes, pages, title) {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const keep = Math.max(1, Math.min(src.getPageCount(), Number(pages) || src.getPageCount()));
  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, Array.from({ length: keep }, (_, i) => i));
  copied.forEach((p) => out.addPage(p));
  out.setTitle(`${title || 'Document'} (signed)`);
  out.setProducer('Guru Broker E-Sign');
  return out.save();
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
  const verifyUrl = `${appUrl()}/verify?id=${encodeURIComponent(sub.id)}`;
  const built = await buildSignedPdf({ originalBytes, doc, sub, signatureData, events, verifyUrl });
  const { originalHash, docPageCount } = built;
  // Seal it: any later change shows as invalid in Adobe and fails the check on /verify.
  let bytes = built.bytes;
  let sealed = false;
  try { const { sealPdf } = await import('./seal.js'); bytes = await sealPdf(bytes, { reason: `Signed electronically: ${doc.title || 'Document'}` }); sealed = true; }
  catch (err) { console.error('Seal failed (PDF delivered unsealed):', err.message); }
  const finalHash = await sha256Hex(bytes);

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
    doc_pages: docPageCount,
    access_key: accessKey,
    sealed,
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
  let onChecklist = false;
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
        onChecklist = true;
      }
    } catch (err) {
      console.error('Could not attach to checklist:', err.message);
    }
  }

  // Sent from a deal but not from a checklist item: put it on the open item with the same name.
  let filedTo = null;
  if (!doc.checklist_item_id && sub.transaction_id) {
    try {
      const lists = await entities.Checklist.filter({ subject_type: 'transaction', subject_id: sub.transaction_id }, '-created_date', 20);
      const norm = (t) => String(t || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
      const title = norm(doc.title);
      const hits = [];
      for (const cl of lists) for (const it of cl.items || []) {
        if (!it.requires_document || it.document_url || ['approved', 'exempt'].includes(it.status)) continue;
        const t = norm(it.title);
        if (t && title && (t === title || (t.length > 5 && title.includes(t)) || (title.length > 5 && t.includes(title)))) hits.push({ cl, it });
      }
      if (hits.length === 1) {
        const { cl, it } = hits[0];
        const at = new Date().toISOString();
        await entities.Checklist.update(cl.id, { items: cl.items.map((i) => (i.id !== it.id ? i : { ...i, document_url: link, document_name: `${doc.title} (signed)`, uploaded_by: 'e-sign', uploaded_at: at, status: 'uploaded', history: [...(i.history || []), { at, by: 'e-sign', what: 'signed copy attached' }] })) });
        filedTo = it.title;
        onChecklist = true;
      }
    } catch (err) { console.error('Checklist match failed:', err.message); }
  }

  // Filed on a checklist item: it's sorted, so take it out of the deal's Unsorted list.
  if (onChecklist && sub.transaction_id) {
    try {
      const tx = await entities.Transaction.get(sub.transaction_id);
      const docs = (tx.documents || []).filter((d) => d.submission_id !== sub.id);
      if (docs.length !== (tx.documents || []).length) await entities.Transaction.update(tx.id, { documents: docs });
    } catch (err) { console.error('Unsorted cleanup failed:', err.message); }
  }

  // Files signers attached go on the deal too.
  const attached = [];
  for (const sd of signatureData) for (const f of sd.fields || []) {
    const field = (doc.fields || []).find((x) => x.id === f.field_id);
    if (field?.type === 'attachment' && f.value) attached.push({ name: `${attachmentName(f.value)} (from ${sd.signer_name || sd.signer_email})`, url: f.value });
  }
  if (sub.transaction_id && attached.length) {
    try {
      const tx = await entities.Transaction.get(sub.transaction_id);
      const docs = Array.isArray(tx.documents) ? tx.documents : [];
      for (const a of attached) if (!docs.some((d) => d.url === a.url)) docs.push({ ...a, uploaded_at: new Date().toISOString(), uploaded_by: 'E-Sign' });
      await entities.Transaction.update(tx.id, { documents: docs });
    } catch (err) { console.error('Could not attach signer files:', err.message); }
  }

  // Tell the sender (and the deal's TC) in the app.
  try {
    const { notifyPeople } = await import('./team.js');
    const people = [];
    if (sub.created_by_email) people.push({ email: sub.created_by_email, full_name: sub.created_by_name });
    if (sub.transaction_id) {
      const tx = await entities.Transaction.get(sub.transaction_id).catch(() => null);
      if (tx?.tc_email) people.push({ email: tx.tc_email });
      if (tx?.agent_email) people.push({ email: tx.agent_email });
    }
    await notifyPeople(entities, {
      brokerageId: sub.brokerage_id || doc.brokerage_id, people,
      title: `Fully signed: "${doc.title}"`,
      message: `${filedTo ? `Filed to the "${filedTo}" checklist item. ` : ''}${attached.length ? `${attached.length} attached file${attached.length === 1 ? '' : 's'} added to the deal.` : 'The signed copy is on the deal.'}`,
      link: sub.transaction_id ? `/Transactions/${sub.transaction_id}?tab=documents` : '/ESignDocuments',
      referenceId: sub.id, referenceType: 'ESign', email: false, pushKind: 'esign',
    });
  } catch (err) { console.error('completion notification failed:', err.message); }

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
