import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();

    if (event.type !== 'update' || event.entity_name !== 'ESignDocument') {
      return Response.json({ status: 'skipped' });
    }

    const document = event.data;
    const oldData = event.old_data;

    if (!document || !document.brokerage_id) {
      return Response.json({ status: 'skipped' });
    }

    // Check if signing status changed
    const oldSignatories = oldData?.signatories || [];
    const newSignatories = document.signatories || [];
    let notificationsCreated = 0;

    // Notify document creator if all signatories have signed
    const allSigned = newSignatories.every(s => s.signed);
    const wasNotAllSigned = !oldSignatories.every(s => s.signed);

    if (allSigned && wasNotAllSigned) {
      await base44.asServiceRole.entities.Notification.create({
        user_email: document.created_by_email,
        type: 'signature_update',
        title: 'Document fully signed',
        description: `"${document.title}" has been signed by all signatories`,
        channel: 'Documents',
        reference_id: document.id,
        reference_type: 'document',
        action_url: `/ESignDocuments?doc=${document.id}`,
        brokerage_id: document.brokerage_id,
        read: false,
      });
      notificationsCreated++;
    } else {
      // Notify about new signatures
      for (let i = 0; i < newSignatories.length; i++) {
        const newSig = newSignatories[i];
        const oldSig = oldSignatories[i];

        if (newSig.signed && !oldSig?.signed) {
          // Someone just signed
          const otherSignatories = newSignatories.filter(s => !s.signed && s.email !== newSig.email);
          if (document.created_by_email !== newSig.email) {
            await base44.asServiceRole.entities.Notification.create({
              user_email: document.created_by_email,
              type: 'signature_update',
              title: `Document signed by ${newSig.name}`,
              description: `"${document.title}" - ${newSig.name} signed. ${otherSignatories.length} signature${otherSignatories.length !== 1 ? 's' : ''} remaining`,
              channel: 'Documents',
              reference_id: document.id,
              reference_type: 'document',
              action_url: `/ESignDocuments?doc=${document.id}`,
              brokerage_id: document.brokerage_id,
              read: false,
            });
            notificationsCreated++;
          }

          // Notify next unsigned signatory if sequential signing
          if (document.require_sequential_signing) {
            const nextUnsigned = newSignatories.find((s, idx) => !s.signed && newSignatories.slice(0, idx).every(x => x.signed));
            if (nextUnsigned) {
              await base44.asServiceRole.entities.Notification.create({
                user_email: nextUnsigned.email,
                type: 'signature_update',
                title: `Your turn to sign: ${document.title}`,
                description: `${newSig.name} has signed. It's now your turn to sign "${document.title}"`,
                channel: 'Documents',
                reference_id: document.id,
                reference_type: 'document',
                action_url: `/ESignDocuments?doc=${document.id}`,
                brokerage_id: document.brokerage_id,
                read: false,
              });
              notificationsCreated++;
            }
          }
        }
      }
    }

    return Response.json({ status: 'success', notificationsCreated });
  } catch (error) {
    console.error('Signature notification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});