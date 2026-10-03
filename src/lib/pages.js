// Pages load in pieces, so the first visit to a page has to download it. To keep the menu
// feeling instant, every page is fetched quietly in the background once the app is idle.
import { lazy } from 'react';

const loaders = [];
const STALE = /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch module|not a valid JavaScript MIME type|Unable to preload CSS|Loading (CSS )?chunk/i;

/** A newer version went live while the app was open, so the old page files are gone: load the new version.
 *  Up to 3 tries a minute, so a real outage can't cause a reload loop. */
export function reloadForNewVersion() {
  let tries = [];
  try { tries = JSON.parse(sessionStorage.getItem('gbh-new-version') || '[]').filter((t) => Date.now() - t < 60000); } catch { /* ignore */ }
  if (tries.length >= 3) return false;
  try { sessionStorage.setItem('gbh-new-version', JSON.stringify([...tries, Date.now()])); } catch { /* ignore */ }
  const u = new URL(window.location.href); u.searchParams.set('v', Date.now().toString(36));
  window.location.replace(u.href);
  return true;
}
export const isStaleLoad = (err) => STALE.test(String(err?.message || err || ''));

/** Like React.lazy, but remembered so it can be fetched ahead of time, and a page from an old
 *  version reloads the app instead of showing an error. */
export function page(load) {
  loaders.push(load);
  return lazy(() => load().catch((err) => {
    if (typeof window !== 'undefined' && isStaleLoad(err) && reloadForNewVersion()) return new Promise(() => {}); // the reload takes over
    throw err;
  }));
}

let started = false;
export function preloadPages() {
  if (started || typeof window === 'undefined') return;
  started = true;
  if (navigator.connection?.saveData) return; // the phone asked to save data
  const idle = window.requestIdleCallback ? (cb) => window.requestIdleCallback(cb, { timeout: 2000 }) : (cb) => setTimeout(cb, 200);
  let i = 0;
  const next = () => {
    if (i >= loaders.length) return;
    const load = loaders[i++];
    window.__gbhPreloading = true;
    load().then(() => { window.__gbhPreloading = false; idle(next); })
      .catch(() => { window.__gbhPreloading = false; }); // a newer version is out; stop and let normal navigation handle it
  };
  setTimeout(() => idle(next), 1500);
}
