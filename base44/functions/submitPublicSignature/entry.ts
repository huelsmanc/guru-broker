import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

async function validateSigningToken(token) {
  const SIGNING_SECRET = Deno.env.get('SIGNING_TOKEN_SECRET') || 'default-secret-key-change-in-production';

  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Invalid token format' };
    }

    const [payloadBase64, signatureBase64] = token.split('.');

    if (!payloadBase64 || !signatureBase64) {
      return { valid: false, error: 'Token is malformed' };
    }

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(SIGNING_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = Uint8Array.from(atob(signatureBase64), (c) => c.charCodeAt(0));

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      encoder.encode(payloadBase64)
    );

    if (!isValid) {
      return { valid: false, error: 'Token signature is invalid' };
    }

    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson);

    if (payload.expiresAt < Date.now()) {
      return { valid: false, error: 'Token has expired' };
    }

    return {
      valid: true,
      documentId: payload.documentId,
      signerEmail: payload.signerEmail,
    };
  } catch (error) {
    return { valid: false, error: `Token validation failed: ${error.message}` };
  }
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { token, signatureData } = body;

    if (!token || !signatureData) {
      return Response.json(
        { success: false, error: 'Missing token or signature data' },
        { status: 400 }
      );
    }

    // Validate token
    const tokenValidation = await validateSigningToken(token);
    if (!tokenValidation.valid) {
      return Response.json(
        { success: false, error: tokenValidation.error },
        { status: 401 }
      );
    }

    const { documentId, signerEmail } = tokenValidation;

    // Use service-role client
    const base44 = createClientFromRequest(req);

    // Fetch document
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: documentId });

    if (docs.length === 0) {
      return Response.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    const document = docs[0];

    // Verify signer exists
    const signerInfo = document.signatories?.find((s) => s.email === signerEmail);
    if (!signerInfo) {
      return Response.json(
        { success: false, error: 'You are not authorized to sign this document' },
        { status: 403 }
      );
    }

    // Prevent re-signing
    if (signerInfo.signed) {
      return Response.json(
        { success: false, error: 'You have already signed this document' },
        { status: 400 }
      );
    }

    // Check sequential signing
    if (document.require_sequential_signing) {
      const signerOrder = signerInfo.order || 0;
      const previousSigners = document.signatories?.filter((s) => (s.order || 0) < signerOrder) || [];
      const allPreviousSigned = previousSigners.every((s) => s.signed);

      if (!allPreviousSigned) {
        return Response.json(
          { success: false, error: 'Previous signers must sign before you' },
          { status: 400 }
        );
      }
    }

    // Update signature fields
    const updatedFields = document.signature_fields?.map((field) => {
      if (field.signer_email === signerEmail && !field.signed) {
        let value;
        if (field.type === 'signature') value = signatureData.signature;
        else if (field.type === 'initial') value = signatureData.initial;
        else if (field.type === 'date') value = signatureData.date;
        else value = signatureData.fullName;

        return {
          ...field,
          signed: true,
          value,
        };
      }
      return field;
    }) || [];

    // Update signer status
    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || '';

    const updatedSignatories = document.signatories?.map((sig) => {
      if (sig.email === signerEmail && !sig.signed) {
        return {
          ...sig,
          signed: true,
          signed_date: new Date().toISOString(),
          signature: signatureData.signature,
          signed_name: signatureData.fullName,
          ip_address: ipAddress,
          user_agent: userAgent,
          consent_agreed: signatureData.consentAgreed === true,
          email_verified: signatureData.emailVerified === true,
        };
      }
      return sig;
    }) || [];

    const allSigned = updatedSignatories.every((s) => s.signed);

    // Update document
    const updateData = {
      signature_fields: updatedFields,
      signatories: updatedSignatories,
      status: allSigned ? 'signed' : 'pending',
      hash_verified: true,
    };

    if (allSigned) {
      updateData.final_signed_document_url = document.document_url;
      const newVersion = (document.versions?.length || 0) + 1;
      updateData.versions = [
        ...(document.versions || []),
        {
          version: newVersion,
          document_url: document.document_url,
          created_date: new Date().toISOString(),
          description: `All signatories completed signing`,
        },
      ];
    }

    await base44.asServiceRole.entities.ESignDocument.update(documentId, updateData);

    // Log signature
    try {
      await base44.asServiceRole.entities.ESignAuditLog.create({
        document_id: documentId,
        signer_email: signerEmail,
        action: 'signed',
        ip_address: ipAddress,
        user_agent: userAgent,
        details: `Signed by ${signatureData.fullName}`,
      });
    } catch (err) {
      console.error('Failed to log signature:', err);
    }

    return Response.json({
      success: true,
      data: {
        allSigned,
        message: allSigned ? 'Document fully signed' : 'Signature submitted',
      },
    });
  } catch (error) {
    console.error('Error submitting signature:', error);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
});

function getClientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const ip = req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip');
  return ip || 'unknown';
}