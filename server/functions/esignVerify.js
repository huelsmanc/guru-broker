// New: public check behind the QR code on every certificate page. Anyone holding the
// signed PDF can confirm who signed it and when, and compare the file's fingerprint.
import { createClientFromRequest } from '../lib/base44.js';

const mask = (e) => String(e || '').replace(/^(.)(.*)(@.*)$/, (m, a, b, c) => `${a}${'*'.repeat(Math.min(b.length, 6))}${c}`);

export default async (req) => {
  try {
    const { id } = await req.json().catch(() => ({}));
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(String(id || ''))) return Response.json({ error: 'Not found' }, { status: 404 });
    const entities = createClientFromRequest(req).asServiceRole.entities;
    const [sub] = await entities.ESignSubmission.filter({ id }, '-created_date', 1);
    if (!sub || sub.status !== 'completed') return Response.json({ error: 'No completed signing record with that ID.' }, { status: 404 });
    const [doc] = await entities.ESignDocument.filter({ id: sub.document_id }, '-created_date', 1);
    return Response.json({
      title: doc?.title || 'Document',
      sent_by: sub.created_by_name || null,
      sent_at: sub.submitted_at || sub.created_date,
      completed_at: sub.completed_at,
      signers: (sub.signers || []).map((s) => ({ name: s.name, email: mask(s.email), signed_at: s.signed_at })),
      final_sha256: sub.final_sha256 || null,
      original_sha256: sub.original_sha256 || null,
      sealed: !!sub.sealed,
    });
  } catch (error) {
    console.error('esignVerify:', error);
    return Response.json({ error: 'Could not check that right now.' }, { status: 500 });
  }
};
