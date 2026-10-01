// CMA report as a branded PDF (layout in server/lib/cmaPdf.js). The browser sends the report and
// the subject photo; the server adds the brokerage's logo and colors, the agent's details, and a
// photo for each comp (its MLS photo, else Google Street View).
import { createClientFromRequest } from '../lib/base44.js';
import { buildCmaPdf } from '../lib/cmaPdf.js';

const MAX_IMG = 3_000_000;

async function toDataUrl(url, ms = 7000) {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms) });
    const type = (res.headers.get('content-type') || '').split(';')[0];
    if (!res.ok || !/^image\/(jpeg|jpg|png)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMG) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

function streetViewUrl(address) {
  const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  if (!key || !address) return null;
  const u = new URL('https://maps.googleapis.com/maps/api/streetview');
  u.search = new URLSearchParams({ size: '640x400', location: address, fov: '80', source: 'outdoor', return_error_code: 'true', key }).toString();
  return u.toString();
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { address, beds, baths, cmaReport, subjectPhoto } = await req.json();
    if (!address || !cmaReport) return Response.json({ error: 'Missing required fields' }, { status: 400 });

    const settings = me.brokerage_id
      ? (await base44.asServiceRole.entities.BrokerageSettings.filter({ brokerage_id: me.brokerage_id }).catch(() => []))[0] || {}
      : {};

    // Comp addresses from web search can lack the town: borrow the subject's.
    const tail = String(address).split(',').slice(1).join(',').trim();
    const comps = (cmaReport.comparables || []).slice(0, 8);
    const [logo, headshot, ...compPhotos] = await Promise.all([
      toDataUrl(settings.logo_url),
      toDataUrl(me.headshot),
      ...comps.map(async (c) => {
        const mls = c.photoUrl && /^https:\/\//.test(c.photoUrl) ? await toDataUrl(c.photoUrl) : null;
        if (mls) return mls;
        let a = String(c.address || '').trim();
        if (a && tail && !a.includes(',')) a = `${a}, ${tail}`;
        return toDataUrl(streetViewUrl(a));
      }),
    ]);

    const photo = typeof subjectPhoto === 'string' && subjectPhoto.length < MAX_IMG * 1.4 ? subjectPhoto : null;
    const pdfData = buildCmaPdf({
      address, beds, baths, report: cmaReport, subjectPhoto: photo, compPhotos,
      brand: { name: settings.brokerage_name || '', color: settings.primary_color || '', logo, phone: settings.brokerage_phone || '' },
      agent: { name: me.display_name || me.full_name || '', email: me.email, phone: me.phone || '', title: me.title || '', photo: headshot },
    });

    const street = String(address).split(',')[0].trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    return Response.json({
      success: true,
      pdf: Buffer.from(pdfData).toString('base64'),
      filename: `CMA_${street}_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
