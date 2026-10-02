// Pages load in pieces, so the first visit to a page has to download it. To keep the menu
// feeling instant, every page is fetched quietly in the background once the app is idle.
import { lazy } from 'react';

const loaders = [];
/** Like React.lazy, but remembered so it can be fetched ahead of time. */
export function page(load) { loaders.push(load); return lazy(load); }

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
