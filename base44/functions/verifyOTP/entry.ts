import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const otpStorage = new Map(); // In production, use Redis or database

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { otp, signerEmail, docId } = await req.json();

    if (!otp || !signerEmail || !docId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // For demo purposes, accept any valid 6-digit code
    if (!/^\d{6}$/.test(otp)) {
      return Response.json({ error: 'Invalid OTP format' }, { status: 400 });
    }

    // In production, verify against stored OTP in cache/database
    // For now, accept the OTP (in real implementation, check against stored value)
    const isValid = true; // Simplified for demo

    if (!isValid) {
      return Response.json({ error: 'Invalid or expired OTP' }, { status: 401 });
    }

    return Response.json({
      status: 'success',
      verified: true,
      message: 'Identity verified',
      verifiedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});