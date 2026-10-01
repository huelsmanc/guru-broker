// New: "Explain this document" for signers. A plain-English summary of what the document
// says (who, what, money, dates, what signing commits you to). Made once and kept on the
// document, so every signer sees the same summary. Not legal advice, and it says so.
import { createClientFromRequest } from '../lib/base44.js';
import { findByToken, matchSigner, isExpired, codeOk, whoseTurn, signerKey } from '../lib/esign.js';
import { signedUrlFor } from '../lib/files.js';
import { InvokeLLM } from '../lib/integrations.js';

const SCHEMA = {
  type: 'object',
  properties: {
    one_line: { type: 'string', description: 'What this document is, in one sentence' },
    points: { type: 'array', items: { type: 'string' }, description: '4-8 short plain-English points: who is involved, the property, money, key dates and deadlines, what you are agreeing to' },
    watch_for: { type: 'array', items: { type: 'string' }, description: 'Up to 4 things a careful signer would want to double-check or ask their agent about' },
  },
  required: ['one_line', 'points', 'watch_for'],
};

export default async (req) => {
  try {
    const { token, proof } = await req.json().catch(() => ({}));
    const entities = createClientFromRequest(req).asServiceRole.entities;
    const sub = await findByToken(entities, token);
    if (!sub || sub.status === 'voided' || (isExpired(sub) && sub.status !== 'completed')) return Response.json({ error: 'This signing link is not valid.' }, { status: 404 });
    const signer = sub.signers[await matchSigner(sub, token)];
    if (!signer.signed && !whoseTurn(sub).some((s) => signerKey(s) === signerKey(signer))) return Response.json({ error: "It isn't your turn yet." }, { status: 409 });
    if (!signer.signed && !(await codeOk(sub, signer, proof))) return Response.json({ error: 'Please enter the code we emailed you first.' }, { status: 401 });
    const [doc] = await entities.ESignDocument.filter({ id: sub.document_id }, '-created_date', 1);
    if (!doc) return Response.json({ error: 'Document not found.' }, { status: 404 });
    if (doc.ai_summary?.points) return Response.json({ summary: doc.ai_summary });

    const summary = await InvokeLLM({
      file_urls: [await signedUrlFor(doc.document_url, 900)],
      response_json_schema: SCHEMA,
      max_tokens: 1500,
      system: 'You explain real estate documents to everyday people in plain, friendly English (8th-grade reading level). Be accurate and neutral. Only state what the document says; never invent numbers or dates. Do not give legal advice or tell the reader whether to sign.',
      prompt: `Explain this document, titled "${String(doc.title || '').slice(0, 200)}", to the person about to sign it. Keep each point under 25 words.`,
    });
    const clean = {
      one_line: String(summary?.one_line || '').slice(0, 400),
      points: (summary?.points || []).slice(0, 8).map((p) => String(p).slice(0, 300)),
      watch_for: (summary?.watch_for || []).slice(0, 4).map((p) => String(p).slice(0, 300)),
      made_at: new Date().toISOString(),
    };
    await entities.ESignDocument.update(doc.id, { ai_summary: clean }).catch(() => {});
    return Response.json({ summary: clean });
  } catch (error) {
    console.error('esignExplain:', error);
    return Response.json({ error: 'The summary is not available right now. Ask your agent if you have questions.' }, { status: 500 });
  }
};
