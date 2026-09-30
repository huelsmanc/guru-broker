import { createClient } from 'npm:@base44/sdk@0.8.20';

// Import token validation utility
// Note: In Deno, we need to inline the validation logic since we can't import from sibling files
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

    // Verify signature
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

    // Decode payload
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson);

    // Check expiration
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
    const { token } = body;

    if (!token) {
      console.error('Missing token');
      return Response.json(
        { success: false, error: 'Missing signing token' },
        { status: 400 }
      );
    }

    // Validate token
    const tokenValidation = await validateSigningToken(token);
    if (!tokenValidation.valid) {
      console.error('Token validation failed:', tokenValidation.error);
      return Response.json(
        { success: false, error: tokenValidation.error },
        { status: 401 }
      );
    }

    const { documentId, signerEmail } = tokenValidation;

    // Use service-role client (works without Base44 headers)
    const base44 = createClient({
      appId: Deno.env.get('BASE44_APP_ID'),
      apiKey: Deno.env.get('BASE44_API_KEY'),
    });

    // Fetch document
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: documentId });

    if (docs.length === 0) {
      return Response.json(
        { success: false, error: 'Document not found' },
        { status: 404 }
      );
    }

    const document = docs[0];

    // Verify signer exists in signatories
    const signerExists = document.signatories?.some((s) => s.email === signerEmail);
    if (!signerExists) {
      console.error(`Signer ${signerEmail} not authorized for document ${documentId}`);
      return Response.json(
        { success: false, error: 'You are not authorized to sign this document' },
        { status: 403 }
      );
    }

    // Log document view
    try {
      await base44.asServiceRole.entities.ESignAuditLog.create({
        document_id: documentId,
        signer_email: signerEmail,
        action: 'viewed',
        ip_address: getClientIp(req),
        user_agent: req.headers.get('user-agent') || 'unknown',
      });
    } catch (err) {
      console.error('Failed to log document view:', err);
    }

    // Return minimal document data (only what's needed)
    return Response.json({
      success: true,
      data: {
        id: document.id,
        title: document.title,
        document_url: document.document_url,
        created_by_name: document.created_by_name,
        created_date: document.created_date,
        signature_fields: document.signature_fields?.filter((f) => f.signer_email === signerEmail) || [],
        signatories: document.signatories,
        require_sequential_signing: document.require_sequential_signing,
        status: document.status,
      },
    });
  } catch (error) {
    console.error('Error retrieving document:', error);
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