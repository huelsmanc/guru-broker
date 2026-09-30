// Ported from Base44 function `encryptDocument`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { fileUrl, docId } = await req.json();

    if (!fileUrl || !docId) {
      return Response.json({ error: 'Missing fileUrl or docId' }, { status: 400 });
    }

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
      ['encrypt']
    );

    // Fetch document from URL
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.statusText}`);
    }

    const documentBuffer = await response.arrayBuffer();

    // Generate IV (initialization vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the document
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      documentBuffer
    );

    // Store encryption metadata with the document
    await base44.entities.ESignDocument.update(docId, {
      encryption_metadata: {
        algorithm: 'AES-256-GCM',
        iv: Array.from(iv),
        encrypted: true,
        encryptedAt: new Date().toISOString(),
      }
    });

    return Response.json({
      status: 'encrypted',
      docId,
      encryptedSize: encryptedData.byteLength,
      originalSize: documentBuffer.byteLength,
      encryptedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});