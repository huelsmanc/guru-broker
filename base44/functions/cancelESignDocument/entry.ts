import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { docId } = await req.json();

    if (!docId) {
      return Response.json({ error: 'docId required' }, { status: 400 });
    }

    const doc = await base44.asServiceRole.entities.ESignDocument.get(docId);
    if (!doc) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    // Update document status to cancelled
    await base44.asServiceRole.entities.ESignDocument.update(docId, { status: 'cancelled' });

    // Send cancellation emails to all signatories
    const signatories = doc.signatories || [];
    for (const sig of signatories) {
      if (!sig.signed) {
        await base44.integrations.Core.SendEmail({
          to: sig.email,
          subject: `Document Cancelled: ${doc.title}`,
          body: `Hi ${sig.name},\n\nThe document "${doc.title}" has been cancelled and is no longer available for signing.\n\nIf you have any questions, please contact ${doc.created_by_name}.\n\nBest regards`,
        });
      }
    }

    return Response.json({ success: true, message: 'Document cancelled and notifications sent' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});