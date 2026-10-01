// Opens a private file (/api/file?p=<path>). Checks the person is signed in and allowed to
// see the record the file belongs to, then redirects to a link that works for one minute.
// The browser sends the sign-in automatically (a cookie the app keeps up to date), so
// <img>, <iframe> and download links work as normal links inside the app.
import { createClientFromRequest } from '../server/lib/base44.js';
import { parsePath, canAccess, signedUrlFor, fileUrl } from '../server/lib/files.js';

function tokenFrom(request) {
  const h = request.headers.get('authorization') || '';
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)gbh_at=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const page = (status, title, body) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font-family:system-ui,Arial,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;color:#1f2937;text-align:center"><h1 style="font-size:20px">${title}</h1><p style="color:#6b7280">${body}</p></body>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
);

export async function GET(request) {
  const url = new URL(request.url);
  const path = url.searchParams.get('p') || '';
  const info = parsePath(path);
  if (!info) return page(404, 'File not found', 'This link is not valid.');
  const wantsPage = (request.headers.get('accept') || '').includes('text/html');
  const token = tokenFrom(request);
  const signIn = () => (wantsPage
    ? new Response(null, { status: 302, headers: { Location: `/login?next=${encodeURIComponent(fileUrl(path, { download: url.searchParams.get('download') === '1' }))}`, 'cache-control': 'no-store' } })
    : new Response('Sign in required', { status: 401, headers: { 'cache-control': 'no-store' } }));
  if (!token) return signIn();

  const base44 = createClientFromRequest(new Request(request.url, { headers: { authorization: `Bearer ${token}` } }));
  let me;
  try { me = await base44.auth.me(); } catch { return signIn(); }
  if (!(await canAccess(me, info, base44.entities))) {
    return wantsPage ? page(403, "You don't have access to this file", 'It belongs to a deal or conversation you are not part of. Ask the agent to share it with you.') : new Response('Forbidden', { status: 403 });
  }
  try {
    const link = await signedUrlFor(fileUrl(path), 120, { download: url.searchParams.get('download') === '1' });
    return new Response(null, { status: 302, headers: { Location: link, 'cache-control': 'private, max-age=60' } });
  } catch {
    return page(404, 'File not found', 'It may have been deleted.');
  }
}
