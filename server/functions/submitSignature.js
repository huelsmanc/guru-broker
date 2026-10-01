// Records a signer's signature. When the last signer finishes, the signed PDF is built
// and emailed to everyone. Rewritten during the migration (see server/lib/esign.js).
import { createClientFromRequest } from '../lib/base44.js';
import { recordSignature, finalize } from '../lib/esign.js';

export default async (req) => {
  try {
    const { submissionToken, signedFields, userAgent, proof } = await req.json().catch(() => ({}));
    const entities = createClientFromRequest(req).asServiceRole.entities;
    const { sub, doc, completed } = await recordSignature({ entities, token: submissionToken, signedFields, req, userAgent, proof });

    if (completed) {
      try {
        await finalize({ entities, sub, doc });
      } catch (err) {
        // The signature is saved either way; the PDF can be rebuilt from the dashboard.
        console.error('finalize failed:', err);
        await entities.ESignSubmission.update(sub.id, { finalize_error: String(err.message || err) }).catch(() => {});
      }
    }
    return Response.json({ status: 'success', completed });
  } catch (error) {
    if (!error.status) console.error('submitSignature:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
