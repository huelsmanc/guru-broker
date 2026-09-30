import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { docId, email, name, brokerageId } = await req.json();

    if (!docId || !email || !name || !brokerageId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Extract IP address from request headers
    const ipAddress = 
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      'Unknown';

    // Extract user agent (device/browser info)
    const userAgent = req.headers.get('user-agent') || 'Unknown';

    // Parse user agent to extract browser and OS info
    const parseUserAgent = (ua) => {
      let browser = 'Unknown';
      let os = 'Unknown';

      // Browser detection
      if (ua.includes('Chrome')) browser = 'Chrome';
      else if (ua.includes('Safari')) browser = 'Safari';
      else if (ua.includes('Firefox')) browser = 'Firefox';
      else if (ua.includes('Edge')) browser = 'Edge';
      else if (ua.includes('Opera')) browser = 'Opera';

      // OS detection
      if (ua.includes('Windows')) os = 'Windows';
      else if (ua.includes('Mac')) os = 'macOS';
      else if (ua.includes('Linux')) os = 'Linux';
      else if (ua.includes('Android')) os = 'Android';
      else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

      return { browser, os };
    };

    const { browser, os } = parseUserAgent(userAgent);

    // Attempt IP geolocation lookup (optional, graceful fallback)
    let location = null;
    try {
      if (ipAddress !== 'Unknown') {
        const geoResponse = await fetch(`https://ip-api.com/json/${ipAddress}?fields=country,regionName,city,lat,lon,status`, {
          method: 'GET',
        });
        
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          if (geoData.status === 'success') {
            location = {
              country: geoData.country || 'Unknown',
              region: geoData.regionName || 'Unknown',
              city: geoData.city || 'Unknown',
              latitude: geoData.lat || null,
              longitude: geoData.lon || null,
            };
          }
        }
      }
    } catch (geoError) {
      // Silently fail - geolocation is optional
      console.warn('Geolocation lookup failed:', geoError.message);
    }

    // Create audit log entry with enhanced metadata
    await base44.asServiceRole.entities.ActivityLog.create({
      brokerage_id: brokerageId,
      document_id: docId,
      action_type: 'signed',
      user_email: email,
      user_name: name,
      ip_address: ipAddress,
      user_agent: `${browser} on ${os}`,
      location,
      details: `Signed document from ${ipAddress}`,
    });

    return Response.json({
      status: 'success',
      metadata: {
        ipAddress,
        userAgent: `${browser} on ${os}`,
        location,
      },
    });
  } catch (error) {
    console.error('Metadata capture error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});