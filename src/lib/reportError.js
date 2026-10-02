// Sends crashes in the browser to the platform owner's error list (see server/functions/reportError.js).
// Quiet by design: never shows anything to the person, never reports the same thing twice per visit,
// and stops after a handful so a broken page can't send hundreds.
import { supabase } from '@/api/base44Client';

const IGNORE = /ResizeObserver loop|^Script error\.?$|AbortError|aborted|Load failed|Failed to fetch|NetworkError|network error|chrome-extension:|moz-extension:|safari-(web-)?extension:|webkit-masked-url|dynamically imported module|Importing a module script failed|not a valid JavaScript MIME type|Unable to preload CSS|_result\.default/i;
const sent = new Set();
let total = 0;

export async function reportError(error, { component } = {}) {
  try {
    const message = String(error?.message || error || '').slice(0, 2000);
    if (!message || IGNORE.test(message) || total >= 8) return;
    const key = message.slice(0, 200);
    if (sent.has(key)) return;
    sent.add(key); total += 1;
    let token = null;
    try { token = (await supabase.auth.getSession()).data.session?.access_token || null; } catch { /* signed out */ }
    await fetch('/api/fn/reportError', {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message, stack: String(error?.stack || '').slice(0, 6000), component: component ? String(component).slice(0, 1500) : undefined, url: window.location.href }),
    });
  } catch { /* reporting must never cause trouble */ }
}

export function installErrorReporting() {
  if (typeof window === 'undefined' || window.__gbhErrors) return;
  window.__gbhErrors = true;
  window.addEventListener('error', (e) => {
    // Only our own scripts; extensions and other sites' scripts aren't ours to fix.
    if (e.filename && !e.filename.startsWith(window.location.origin)) return;
    reportError(e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (!r || r.status === 401 || r.status === 403 || r.status === 404) return; // expected answers, not crashes
    reportError(r instanceof Error ? r : new Error(typeof r === 'string' ? r : JSON.stringify(r).slice(0, 500)));
  });
}
