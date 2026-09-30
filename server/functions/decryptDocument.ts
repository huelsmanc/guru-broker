// Ported from Base44 function `decryptDocument`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { docId, encryptedFileUrl } = await req.json();

    if (!docId || !encryptedFileUrl) {
      return Response.json({ error: 'Missing docId or encryptedFileUrl' }, { status: 400 });
    }

    // Verify user has access to this document
    const doc = await base44.entities.ESignDocument.filter({ id: docId });
    if (!doc || doc.length === 0) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    const document = doc[0];

    // Get encryption key from environment
    const encryptionKeyBase64 = Deno.env.get('DOCUMENT_ENCRYPTION_KEY');
    if (!encryptionKeyBase64) {
      throw new Error('Encryption key not configured');
    }

    // Decode the base64 key
    const keyData = new Uint8Array(atob(encryptionKeyBase64).split('').map(c => c.charCodeAt(0)));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    // Get encryption metadata
    const metadata = document.encryption_metadata;
    if (!metadata || !metadata.encrypted) {
      return Response.json({ error: 'Document is not encrypted' }, { status: 400 });
    }

    // Fetch encrypted document
    const response = await fetch(encryptedFileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch encrypted document: ${response.statusText}`);
    }

    const encryptedData = await response.arrayBuffer();

    // Reconstruct IV from stored metadata
    const iv = new Uint8Array(metadata.iv);

    // Decrypt the document
    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encryptedData
    );

    // Log access for audit trail
    await base44.entities.ActivityLog.create({
      brokerage_id: document.brokerage_id,
      document_id: docId,
      action_type: 'viewed',
      user_email: (await base44.auth.me()).email,
      user_name: (await base44.auth.me()).full_name,
      details: 'Decrypted and accessed encrypted document',
    });

    return Response.json({
      status: 'decrypted',
      docId,
      decryptedSize: decryptedData.byteLength,
      encryptedAt: metadata.encryptedAt,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});