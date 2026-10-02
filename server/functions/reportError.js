// New: the app in people's browsers reports crashes here (signed in or not, e.g. on the login page).
// Grouped and counted like server errors. Capped so a flood of junk can't fill the table.
import { adminClient } from '../lib/base44.js';
import { logError, emailFromRequest } from '../lib/errors.js';

const MAX_NEW_PER_HOUR = 300;
// Noise that isn't ours to fix: browser extensions, network blips, a tab left open across a deploy.
const IGNORE = /ResizeObserver loop|^Script error\.?$|AbortError|aborted|Load failed|Failed to fetch|NetworkError|network error|chrome-extension:|moz-extension:|safari-(web-)?extension:|webkit-masked-url|dynamically imported module|Importing a module script failed|not a valid JavaScript MIME type|Unable to preload CSS/i;
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

export default async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const message = clip(body.message, 2000);
    if (!message || IGNORE.test(message) || IGNORE.test(String(body.stack || '').slice(0, 300))) return Response.json({ ok: true, skipped: true });
    let path = '/';
    try { path = new URL(String(body.url || ''), 'https://x').pathname; } catch { /* keep "/" */ }
    const { count } = await adminClient().from('app_error').select('id', { count: 'exact', head: true }).eq('source', 'browser').gte('first_seen', new Date(Date.now() - 3600e3).toISOString());
    if ((count || 0) >= MAX_NEW_PER_HOUR) return Response.json({ ok: true, skipped: 'busy' });
    await logError({
      source: 'browser', location: path, message,
      detail: [clip(body.stack, 6000), body.component ? `Component: ${clip(body.component, 1500)}` : null].filter(Boolean).join('\n\n') || null,
      userEmail: emailFromRequest(req), url: clip(body.url, 1000), userAgent: req.headers.get('user-agent'),
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('reportError:', error);
    return Response.json({ ok: false });
  }
};
