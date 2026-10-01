// New: check a document before it goes out. Quick rule checks always run; an AI review of
// the PDF and the deal is added when AI is set up. Nothing is blocked; the sender decides.
// { documentId, signers: [{name,email}], transactionId? } -> { issues: [{severity,title,detail}], ai }
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';
import { signedUrlFor } from '../lib/files.js';
import { fieldSignerIndex, isPrefilled } from '../../shared/esignGeometry.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Rule checks that need no AI. Exported for tests. */
export function ruleChecks(doc, signers) {
  const issues = [];
  const add = (severity, title, detail) => issues.push({ severity, title, detail });
  const list = (signers || []).filter((s) => s && (s.email || s.name));
  if (!list.length) add('critical', 'No signers', 'Add at least one person to sign.');
  const seen = new Set();
  list.forEach((s, i) => {
    const email = String(s.email || '').trim().toLowerCase();
    const who = s.name || `Signer ${i + 1}`;
    if (!EMAIL.test(email)) add('critical', `Check ${who}'s email`, `"${s.email || ''}" doesn't look like an email address.`);
    else if (seen.has(email)) add('warning', 'Same email twice', `${email} is listed more than once. Each signer needs their own email.`);
    seen.add(email);
    if (!String(s.name || '').trim()) add('info', `Signer ${i + 1} has no name`, 'Their name appears on the certificate, so add it if you can.');
  });
  const fields = doc.fields || [];
  list.forEach((s, i) => {
    const mine = fields.filter((f) => fieldSignerIndex(f) === i && !isPrefilled(f));
    const who = s.name || s.email || `Signer ${i + 1}`;
    if (fields.length && !mine.length) add('critical', `Nothing for ${who} to fill`, 'Place at least a signature for them, or remove them.');
    else if (mine.length && !mine.some((f) => f.type === 'signature' || f.type === 'initial')) add('warning', `${who} has no signature box`, 'They have fields to fill but nothing to sign.');
  });
  fields.forEach((f) => {
    if (fieldSignerIndex(f) >= list.length && list.length && !isPrefilled(f)) add('critical', 'A field belongs to a missing signer', `A ${f.type} box is assigned to signer ${fieldSignerIndex(f) + 1}, but only ${list.length} signer(s) are listed.`);
    if (Number(f.x) < 0 || Number(f.x) + Number(f.width || 0) > 100.5 || Number(f.y) < 0 || Number(f.y) > 100) add('warning', 'A box is off the page', `A ${f.type} box sits partly outside the page.`);
    if (f.type === 'dropdown' && !(f.options || []).filter(Boolean).length) add('critical', 'Empty dropdown', 'A dropdown has no choices to pick from.');
    if (f.show_if && !fields.some((g) => g.id === (f.show_if.field_id || f.show_if))) add('warning', 'A condition points at a deleted box', 'A box only shows when another box is filled, but that box is gone.');
  });
  if (!fields.length) add('info', 'No boxes placed', 'Signers will get one signature box at the end of the document.');
  return issues;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const { documentId, signers, transactionId, skipAi } = await req.json();
    const [doc] = await base44.asServiceRole.entities.ESignDocument.filter({ id: documentId }, '-created_date', 1);
    if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });
    if (doc.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') return Response.json({ error: 'Not allowed' }, { status: 403 });

    const issues = ruleChecks(doc, signers);
    let ai = false;
    if (!skipAi && (process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY)) {
      try {
        // The deal, through the person's own access (so private deals stay private).
        const txId = transactionId || doc.transaction_id;
        const tx = txId ? await base44.entities.Transaction.get(txId).catch(() => null) : null;
        const facts = tx ? { property: tx.property_address, price: tx.sale_price, buyers: tx.buyers, sellers: tx.sellers, closing: tx.closing_date, acceptance: tx.acceptance_date, earnest_money: tx.earnest_money } : null;
        const boxes = (doc.fields || []).map((f) => ({ type: f.type, signer: fieldSignerIndex(f) + 1, label: f.label || f.placeholder || null, prefilled: isPrefilled(f) ? String(f.value || '').slice(0, 80) : null, page_position_pct: Math.round(Number(f.y)) }));
        const result = await InvokeLLM({
          file_urls: [await signedUrlFor(doc.document_url, 900)],
          max_tokens: 1500,
          system: 'You are a careful real estate transaction coordinator checking a document before it is sent for e-signature. Only flag real problems supported by the document and data. Be brief.',
          response_json_schema: {
            type: 'object',
            properties: { items: { type: 'array', items: { type: 'object', properties: { severity: { type: 'string', enum: ['critical', 'warning', 'info'] }, title: { type: 'string' }, detail: { type: 'string' } }, required: ['severity', 'title', 'detail'] } } },
            required: ['items'],
          },
          prompt: `Check this document before it goes out for signature. Look for: signature or initial lines in the PDF with no box placed for anyone; blanks that look like they should be filled before sending; names, address or price in the document that don't match the deal; missing pages or obviously wrong document for the deal. At most 6 items; return none if it looks right.
Signers: ${JSON.stringify((signers || []).map((s, i) => ({ n: i + 1, name: s.name })))}
Boxes placed: ${JSON.stringify(boxes).slice(0, 6000)}
Deal: ${JSON.stringify(facts)}`,
        });
        for (const it of (result?.items || []).slice(0, 6)) issues.push({ severity: ['critical', 'warning', 'info'].includes(it.severity) ? it.severity : 'info', title: String(it.title).slice(0, 120), detail: String(it.detail).slice(0, 400), ai: true });
        ai = true;
      } catch (err) {
        console.error('preflight AI skipped:', err.message);
      }
    }
    const rank = { critical: 0, warning: 1, info: 2 };
    issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
    return Response.json({ issues, ai });
  } catch (error) {
    console.error('esignPreflight:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
