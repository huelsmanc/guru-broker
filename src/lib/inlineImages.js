// Before turning a design into a picture: swap every image in it for an embedded copy and wait
// until each is ready. Otherwise the export can come out without photos (signed-in-only files,
// images that hadn't loaded yet, and Safari's habit of skipping images on the first pass).
import { supabase } from '@/api/base44Client';

const cache = new Map();
const isSafari = () => typeof navigator !== 'undefined' && /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

async function asDataUrl(src) {
  if (!src || src.startsWith('data:')) return src;
  if (cache.has(src)) return cache.get(src);
  const url = new URL(src, window.location.href);
  const sameSite = url.origin === window.location.origin;
  const headers = {};
  if (sameSite && url.pathname.startsWith('/api/')) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(url.href, { headers, credentials: sameSite ? 'include' : 'omit', mode: 'cors' });
  if (!res.ok) throw new Error(`image ${res.status}`);
  const blob = await res.blob();
  const out = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
  cache.set(src, out);
  return out;
}

export async function inlineImages(node) {
  const imgs = [...node.querySelectorAll('img')];
  await Promise.all(imgs.map(async (img) => {
    const src = img.getAttribute('src');
    try {
      const data = await asDataUrl(src);
      if (data && data !== src) img.setAttribute('src', data);
    } catch { /* leave it; the export still tries the original */ }
    try { if (img.decode) await img.decode(); } catch { /* broken image */ }
  }));
  const withBg = [node, ...node.querySelectorAll('*')].filter((el) => /url\(/.test(el.style?.backgroundImage || ''));
  await Promise.all(withBg.map(async (el) => {
    const m = /url\(["']?([^"')]+)["']?\)/.exec(el.style.backgroundImage);
    try { const data = await asDataUrl(m?.[1]); if (data) el.style.backgroundImage = `url("${data}")`; } catch { /* keep */ }
  }));
  try { await document.fonts?.ready; } catch { /* ignore */ }
}

/** Runs an html-to-image export (toPng / toJpeg) with images embedded first. */
export async function renderImage(fn, node, opts) {
  await inlineImages(node);
  let out = await fn(node, opts);
  if (isSafari()) out = await fn(node, opts); // Safari draws images only from the second pass
  return out;
}
