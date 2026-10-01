// New: a street-level photo of a house by address (Google Street View), for CMA comps that
// don't have MLS listing photos. GET /api/fn/streetView?address=...  Signed-in people only
// (the app's sign-in cookie), and the Google key never reaches the browser.
import { createClientFromRequest } from '../lib/base44.js';

function tokenFrom(request) {
  const h = request.headers.get('authorization') || '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)gbh_at=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
const none = (status = 404) => new Response(null, { status, headers: { 'cache-control': 'no-store' } });

export default async (req) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const address = String(new URL(req.url).searchParams.get('address') || '').trim().slice(0, 200);
  if (!key || address.length < 5) return none();
  const token = tokenFrom(req);
  if (!token) return none(401);
  try {
    await createClientFromRequest(new Request(req.url, { headers: { authorization: `Bearer ${token}` } })).auth.me();
  } catch {
    return none(401);
  }
  const u = new URL('https://maps.googleapis.com/maps/api/streetview');
  u.search = new URLSearchParams({ size: '640x400', location: address, fov: '80', source: 'outdoor', return_error_code: 'true', key }).toString();
  const res = await fetch(u);
  if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return none(); // no street imagery here
  return new Response(await res.arrayBuffer(), {
    headers: { 'content-type': res.headers.get('content-type'), 'cache-control': 'private, max-age=604800' },
  });
};
