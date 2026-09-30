// Ported from Base44 function `createSubmissionFromTemplate`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId, signers, sequenceType, transactionId } = await req.json();

    if (!templateId || !signers || !Array.isArray(signers) || signers.length === 0) {
      return Response.json({ error: 'templateId and signers array required' }, { status: 400 });
    }

    // Get the template
    const templates = await base44.asServiceRole.entities.ESignTemplate.filter({ id: templateId }, '-created_date', 1);
    if (!templates.length) {
      return Response.json({ error: 'Template not found' }, { status: 404 });
    }

    const template = templates[0];

    // Create document from template
    const docName = `${template.title} - ${new Date().toLocaleDateString()}`;
    const doc = await base44.asServiceRole.entities.ESignDocument.create({
      brokerage_id: template.brokerage_id,
      title: docName,
      document_url: template.document_url,
      fields: template.fields,
      signers: signers.map((s, i) => ({
        id: `signer-${Date.now()}-${i}`,
        email: s.email,
        name: s.name || s.email.split('@')[0],
        order: sequenceType === 'sequential' ? i + 1 : 0,
      })),
      created_by_email: user.email,
      created_by_name: user.full_name,
      status: 'draft',
    });

    // Create submission
    const submission = {
      document_id: doc.id,
      transaction_id: transactionId || '',
      created_by_email: user.email,
      created_by_name: user.full_name,
      status: 'pending',
      sequence_type: sequenceType || 'all_at_once',
      signers: signers.map((s, i) => ({
        email: s.email,
        name: s.name || s.email.split('@')[0],
        order: sequenceType === 'sequential' ? i + 1 : 0,
        token: crypto.randomUUID(),
        signed: false,
        signed_at: null,
      })),
      submitted_at: new Date().toISOString(),
      completed_at: null,
    };

    const created = await base44.asServiceRole.entities.ESignSubmission.create(submission);

    // Send signing emails
    const signerCount = signers.length;
    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i];
      const signerToken = submission.signers.find(s => s.email === signer.email)?.token;
      const signingLink = `${Deno.env.get('BASE44_APP_URL') || 'http://localhost:5173'}/sign?token=${signerToken}`;
      
      let sequenceNote = '';
      if (sequenceType === 'sequential') {
        sequenceNote = `<p style="color:#666; font-size:14px;">This is signature ${i + 1} of ${signerCount}${i > 0 ? '. You will receive this document after the previous signer(s) complete.' : ''}</p>`;
      }

      await base44.integrations.Core.SendEmail({
        to: signer.email,
        subject: `Please sign: ${template.title}`,
        body: `<p>Hello ${signer.name},</p>
<p>A document requires your signature.</p>
<p><strong>Document:</strong> ${template.title}</p>
<p><strong>From:</strong> ${user.full_name}</p>
${sequenceNote}
<p style="margin-top: 24px;"><a href="${signingLink}" style="display:inline-block; padding:12px 24px; background-color:#667eea; color:white; text-decoration:none; border-radius:6px; font-weight:bold; font-size:16px;">Review & Sign Document</a></p>
<p style="color:#666; font-size:14px; margin-top: 16px;">This link will expire in 30 days.</p>`,
      });
    }

    // Send confirmation to sender
    await base44.integrations.Core.SendEmail({
      to: user.email,
      subject: `Document sent for signature: ${template.title}`,
      body: `<p>Hello ${user.full_name},</p>
<p>Your document has been sent for signature using the template.</p>
<p><strong>Document:</strong> ${template.title}</p>
<p><strong>Signers:</strong> ${signers.map(s => s.name || s.email).join(', ')}</p>
<p><strong>Signing Mode:</strong> ${sequenceType === 'sequential' ? 'Sequential - signers will sign in order' : 'All at once - all signers can sign immediately'}</p>
<p style="margin-top: 16px; color:#666;">You will receive updates as signers complete their signatures. View the status in your e-sign dashboard.</p>`,
    });

    return Response.json({
      status: 'success',
      submission_id: created.id,
      document_id: doc.id,
    });
  } catch (error) {
    console.error('Error creating submission from template:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});