import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    // Only accept POST
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Verify webhook secret
    const signature = req.headers.get('X-Docuseal-Signature');
    const secret = Deno.env.get('DOCUSEAL_WEBHOOK_SECRET');
    
    if (signature && secret) {
      const body_text = await req.text();
      const encoder = new TextEncoder();
      const data_bytes = encoder.encode(body_text + secret);
      const hash_buffer = await crypto.subtle.digest('SHA-256', data_bytes);
      const hash_array = Array.from(new Uint8Array(hash_buffer));
      const computed_signature = hash_array.map(b => b.toString(16).padStart(2, '0')).join('');
      
      if (computed_signature !== signature) {
        return Response.json({ error: 'Invalid signature' }, { status: 401 });
      }
      body = JSON.parse(body_text);
    } else {
      body = await req.json();
    }

    const { event_type, data } = body;

    // Handle form completion events
    if (event_type === 'form.completed' && data?.status === 'completed') {
      const base44 = createClientFromRequest(req);
      
      // external_id in the template should be our document ID (e.g., "doc-1234567890")
      const externalId = data.template?.external_id;
      
      if (!externalId) {
        console.log('No external_id found, skipping update');
        return Response.json({ status: 'skipped', reason: 'no_external_id' });
      }

      // Find the transaction by looking for ESign documents with this external ID
      const transactions = await base44.asServiceRole.entities.Transaction.list('-created_date', 100);
      
      let updated = false;
      for (const tx of transactions) {
        const esignDocs = tx.esign_docs || [];
        const docIndex = esignDocs.findIndex(d => d.envelope_id === externalId || d.id === externalId);
        
        if (docIndex !== -1) {
          // Download and store the signed PDF and audit log
          let signedPdfUrl = null;
          let auditLogUrl = null;

          try {
            // Download signed PDF
            if (data.documents?.[0]?.url) {
              const pdfResponse = await fetch(data.documents[0].url);
              const pdfBlob = await pdfResponse.arrayBuffer();
              const pdfFile = new File([pdfBlob], `${data.template.name}_signed.pdf`, { type: 'application/pdf' });
              const uploadedPdf = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: pdfFile });
              signedPdfUrl = uploadedPdf.file_uri;
            }

            // Download audit log
            if (data.audit_log_url) {
              const auditResponse = await fetch(data.audit_log_url);
              const auditBlob = await auditResponse.arrayBuffer();
              const auditFile = new File([auditBlob], `${data.template.name}_audit_log.pdf`, { type: 'application/pdf' });
              const uploadedAudit = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file: auditFile });
              auditLogUrl = uploadedAudit.file_uri;
            }
          } catch (downloadErr) {
            console.error('Failed to download/store files:', downloadErr);
            // Continue with webhook processing even if file storage fails
          }

          // Update the document status
          const updatedEsignDocs = [...esignDocs];
          updatedEsignDocs[docIndex] = {
            ...updatedEsignDocs[docIndex],
            status: 'completed',
            completed_at: data.completed_at,
            audit_log_url: auditLogUrl || data.audit_log_url,
            signed_documents: data.documents,
            signed_pdf_uri: signedPdfUrl,
          };

          // Add the signed document to transaction documents
          const txDocs = [...(tx.documents || [])];
          
          if (signedPdfUrl) {
            txDocs.push({
              name: `${updatedEsignDocs[docIndex].title} (Signed)`,
              url: signedPdfUrl,
              uploaded_at: new Date().toISOString(),
              uploaded_by: 'DocuSeal',
            });
          }

          if (auditLogUrl) {
            txDocs.push({
              name: `${updatedEsignDocs[docIndex].title} (Audit Log)`,
              url: auditLogUrl,
              uploaded_at: new Date().toISOString(),
              uploaded_by: 'DocuSeal',
            });
          }

          await base44.asServiceRole.entities.Transaction.update(tx.id, {
            esign_docs: updatedEsignDocs,
            documents: txDocs,
          });

          console.log(`Updated transaction ${tx.id} with completed e-sign document and stored files`);
          updated = true;
          break;
        }
      }

      if (!updated) {
        console.log(`No transaction found for external_id: ${externalId}`);
        return Response.json({ status: 'not_found', external_id: externalId });
      }

      return Response.json({ status: 'success', external_id: externalId });
    }

    // Ignore other event types for now
    return Response.json({ status: 'ignored', event_type });

  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});