const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getSigningSecret() {
  const secret = Deno.env.get("SIGNING_TOKEN_SECRET");
  if (!secret) {
    throw new Error("Missing SIGNING_TOKEN_SECRET");
  }
  return secret;
}

async function importHmacKey(secret) {
  return await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
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

export async function generateSigningToken({ submissionId, submitterEmail, expiresAt }) {
  if (!submissionId || !submitterEmail || !expiresAt) {
    throw new Error("Missing token payload fields");
  }

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

export async function validateSigningToken(token) {
  try {
    if (!token || !token.includes(".")) {
      return { valid: false, error: "Invalid token format" };
    }

    const [payloadEncoded, signature] = token.split(".");
    if (!payloadEncoded || !signature) {
      return { valid: false, error: "Malformed token" };
    }

    const payloadString = atob(payloadEncoded);
    const payload = JSON.parse(payloadString);

    const expectedSignature = await signPayload(payloadString);
    if (expectedSignature !== signature) {
      return { valid: false, error: "Invalid token signature" };
    }

    if (!payload.expiresAt || Date.now() > Number(payload.expiresAt)) {
      return { valid: false, error: "Signing link has expired" };
    }

    return {
      valid: true,
      submissionId: payload.submissionId,
      submitterEmail: payload.submitterEmail,
      expiresAt: payload.expiresAt,
    };
  } catch (error) {
    return {
      valid: false,
      error: error?.message || "Token validation failed",
    };
  }
}