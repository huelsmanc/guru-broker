// New: copies a listing's MLS photos into our own storage so designs can be exported
// (MLS photo links are often temporary or block downloads from other sites).
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { UploadFile } from '../lib/integrations.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();
    const { listing_id, max = 8 } = await req.json();
    const { data: listing } = await adminClient().from('mls_listing').select('id, photos').eq('id', listing_id).maybeSingle();
    if (!listing) return Response.json({ error: 'Listing not found' }, { status: 404 });
    const out = [];
    for (const url of (listing.photos || []).slice(0, Math.min(Number(max) || 8, 12))) {
      try {
        if (!/^https?:\/\//.test(url)) continue;
        const res = await fetch(url, { redirect: 'follow' });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.startsWith('image/')) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 12 * 1024 * 1024) continue;
        const { file_url } = await UploadFile({ file: buf, filename: `mls-${listing.id.replace(/[^a-z0-9]/gi, '-')}.${type.includes('png') ? 'png' : 'jpg'}`, content_type: type });
        out.push(file_url);
      } catch { /* skip a bad photo */ }
    }
    return Response.json({ photos: out });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
