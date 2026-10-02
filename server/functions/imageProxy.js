// New: hands a signed-in user a copy of an outside picture (an MLS photo, say) so it can be
// drawn into a print file. Browsers block reading pictures from other sites unless the site
// allows it; this fetches it server-side instead. Pictures only, public addresses only.
//   GET /api/fn/imageProxy?u=<https url>   (Authorization: Bearer <token>)
import { createClientFromRequest } from '../lib/base44.js';
import { safeFetch } from '../lib/safeFetch.js';

const OK_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/;

export default async (req) => {
  const base44 = createClientFromRequest(req);
  try { await base44.auth.me(); } catch { return new Response('Sign in required', { status: 401 }); }
  let target = new URL(req.url).searchParams.get('u');
  if (!target && req.method === 'POST') target = (await req.json().catch(() => ({}))).url;
  if (!target) return new Response('Missing picture address', { status: 400 });
  try {
    const { bytes, type } = await safeFetch(target, { accept: OK_TYPES, maxBytes: 15 * 1024 * 1024 });
    return new Response(bytes, { status: 200, headers: { 'content-type': type, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
  } catch (e) {
    return new Response(e.message || 'Could not load that picture', { status: e.status && e.status < 600 ? e.status : 502 });
  }
};
