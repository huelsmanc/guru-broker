import { createClient } from 'npm:@base44/sdk@0.8.20';

// Import token utilities - need inline since Deno doesn't support local imports
const textEncoder = new TextEncoder();

function getSigningSecret() {
  const secret = Deno.env.get("SIGNING_TOKEN_SECRET");
  if (!secret) throw new Error("Missing SIGNING_TOKEN_SECRET");
  return secret;
}

async function importHmacKey(secret) {
  return await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signPayload(payloadString) {
  const key = await importHmacKey(getSigningSecret());
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(payloadString)
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function generateSigningToken({ submissionId, submitterEmail, expiresAt }) {
  const payload = {
    submissionId,
    submitterEmail: submitterEmail.toLowerCase().trim(),
    expiresAt,
  };
  const payloadString = JSON.stringify(payload);
  const payloadEncoded = btoa(payloadString);
  const signature = await signPayload(payloadString);
  return `${payloadEncoded}.${signature}`;
}

function getBaseUrl(req) {
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { submissionId, submitters, templateTitle } = body;

    if (!submissionId || !submitters || submitters.length === 0) {
      return Response.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 });
    }

    const appId = Deno.env.get('BASE44_APP_ID');
    const apiKey = Deno.env.get('BASE44_API_KEY');

    if (!appId) {
      return Response.json({
        success: false,
        error: 'Server configuration error'
      }, { status: 500 });
    }

    const base44 = createClient({
      appId,
      apiKey: apiKey || undefined,
    });

    const baseUrl = getBaseUrl(req);
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    let emailsSent = 0;

    for (const submitter of submitters) {
      try {
        const token = await generateSigningToken({
          submissionId,
          submitterEmail: submitter.email,
          expiresAt,
        });

        const signingLink = `${baseUrl}/sign?token=${encodeURIComponent(token)}`;

        await base44.integrations.Core.SendEmail({
          to: submitter.email,
          subject: `Document to Sign: "${templateTitle}"`,
          body: `Hello,\n\nYou have been sent a document to review and electronically sign: "${templateTitle}"\n\nPlease click the link below to access the signing page:\n${signingLink}\n\nThis link is valid for 24 hours.\n\nThank you`,
          from_name: 'E-Signature Portal',
        });

        emailsSent++;
      } catch (error) {
        console.error(`Failed to send email to ${submitter.email}:`, error.message);
      }
    }

    return Response.json({
      success: true,
      data: {
        emailsSent,
        totalSubmitters: submitters.length,
      },
    });
  } catch (error) {
    console.error('sendSignerEmails error:', error);
    return Response.json({
      success: false,
      error: error.message || 'Internal server error'
    }, { status: 500 });
  }
});