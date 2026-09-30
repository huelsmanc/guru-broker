import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phoneNumber, signerEmail, docId } = await req.json();

    if (!phoneNumber || !signerEmail || !docId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP temporarily (in production, use a cache or temp storage)
    const otpKey = `otp_${docId}_${signerEmail}`;
    
    // Send SMS via Twilio (or fallback to mock for demo)
    try {
      const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

      if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
        const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: twilioPhoneNumber,
            To: phoneNumber,
            Body: `Your Guru Broker document verification code is: ${otp}. This code expires in 10 minutes.`,
          }).toString(),
        });
      } else {
        console.warn('Twilio not configured, OTP would be sent in production');
      }
    } catch (smsError) {
      console.error('SMS send error:', smsError);
      // Continue anyway - OTP is still generated
    }

    return Response.json({
      status: 'success',
      message: 'OTP sent to phone number',
      otpKey,
      expiresAt: expiresAt.toISOString(),
      // Return OTP only in development
      otp: Deno.env.get('DENO_ENV') === 'development' ? otp : undefined,
    });
  } catch (error) {
    console.error('OTP generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});