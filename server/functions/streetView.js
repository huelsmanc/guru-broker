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
  const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const params = new URL(req.url).searchParams;
  const address = String(params.get('address') || '').trim().slice(0, 200);
  const token = tokenFrom(req);
  let signedIn = false;
  if (token) {
    try { await createClientFromRequest(new Request(req.url, { headers: { authorization: `Bearer ${token}` } })).auth.me(); signedIn = true; } catch { /* below */ }
  }

  // Setup check: /api/fn/streetView?check=1&address=... says in plain words what's wrong.
  if (params.get('check')) {
    if (!signedIn) return Response.json({ ok: false, problem: 'Open this link in the browser where you are signed in to Guru Broker.' });
    if (!key) return Response.json({ ok: false, problem: 'GOOGLE_MAPS_API_KEY is not set on this deployment. Add it in Vercel (Production), then Redeploy.' });
    const m = new URL('https://maps.googleapis.com/maps/api/streetview/metadata');
    m.search = new URLSearchParams({ location: address || '1600 Pennsylvania Ave NW, Washington, DC', source: 'outdoor', key }).toString();
    const meta = await fetch(m).then((r) => r.json()).catch((e) => ({ status: 'FETCH_FAILED', error_message: e.message }));
    const hints = {
      REQUEST_DENIED: 'Google refused the key. Check: Street View Static API is enabled in the same Google Cloud project as the key; billing is turned on for that project; and the key\'s "Application restrictions" are None (website/referrer restrictions block server requests — use only the API restriction).',
      ZERO_RESULTS: 'The key works, but Google has no street photo for that address.',
      NOT_FOUND: 'The key works, but Google could not find that address.',
      OVER_QUERY_LIMIT: 'The key works but hit a quota limit in Google Cloud.',
    };
    return Response.json({ ok: meta.status === 'OK', key_ends_with: key.slice(-4), google_status: meta.status, google_message: meta.error_message || null, meaning: meta.status === 'OK' ? 'Working. CMA comps will show street photos.' : hints[meta.status] || 'See google_message.' });
  }

  const problem = (status, text) => Response.json({ problem: text }, { status, headers: { 'cache-control': 'no-store' } });
  if (!key) return problem(404, 'Street photos need GOOGLE_MAPS_API_KEY in Vercel (then Redeploy).');
  if (address.length < 5) return none();
  if (!signedIn) return problem(401, 'Not signed in. Refresh the page.');
  const u = new URL('https://maps.googleapis.com/maps/api/streetview');
  u.search = new URLSearchParams({ size: '640x400', location: address, fov: '80', source: 'outdoor', return_error_code: 'true', key }).toString();
  const res = await fetch(u);
  if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) {
    if (res.status === 404) return none(); // Google has no street imagery for this address
    const said = (await res.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    console.error('streetView: Google said', res.status, said);
    return problem(502, `Google refused the photo (${res.status}): ${said || 'check billing, that Street View Static API is enabled, and that the key has no website restriction.'}`);
  }
  return new Response(await res.arrayBuffer(), {
    headers: { 'content-type': res.headers.get('content-type'), 'cache-control': 'private, max-age=604800' },
  });
};
