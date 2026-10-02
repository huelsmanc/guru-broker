// Fetches an outside web address for a signed-in user without letting it reach anything
// private: only http(s) on the normal ports, never a private/loopback/link-local address
// (checked on every redirect), with a time limit and a size cap.
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    const hexMapped = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) { const hi = parseInt(hexMapped[1], 16); const lo = parseInt(hexMapped[2], 16); return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`); }
    if (/^::(\d+\.\d+\.\d+\.\d+|[0-9a-f]{1,4}:[0-9a-f]{1,4})$/.test(v)) return true; // old IPv4-compatible form
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('2001:db8');
  }
  return true;
}

export async function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw Object.assign(new Error('Not a valid web address'), { status: 400 }); }
  if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('Only web addresses can be used'), { status: 400 });
  if (u.port && !['80', '443'].includes(u.port)) throw Object.assign(new Error('That address is not allowed'), { status: 400 });
  if (u.username || u.password) throw Object.assign(new Error('That address is not allowed'), { status: 400 });
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw Object.assign(new Error('That address is not allowed'), { status: 400 });
  const addrs = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw Object.assign(new Error('Could not find that site'), { status: 400 });
  if (addrs.some((a) => isPrivateAddress(a.address))) throw Object.assign(new Error('That address is not allowed'), { status: 400 });
  return u;
}

/** Returns { res, bytes, type } or throws. `accept` filters the content type (e.g. /^image\//). */
export async function safeFetch(raw, { maxBytes = 15 * 1024 * 1024, timeoutMs = 12000, accept, headers = {} } = {}) {
  let url = await checkUrl(raw);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    for (let hop = 0; hop < 4; hop += 1) {
      const res = await fetch(url, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GuruBroker/1.0)', ...headers } });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        url = await checkUrl(new URL(res.headers.get('location'), url).href);
        continue;
      }
      if (!res.ok) throw Object.assign(new Error(`The site answered ${res.status}`), { status: 502 });
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (accept && !accept.test(type)) throw Object.assign(new Error('That is not a picture'), { status: 415 });
      const len = Number(res.headers.get('content-length') || 0);
      if (len > maxBytes) throw Object.assign(new Error('That file is too big'), { status: 413 });
      const reader = res.body.getReader();
      const chunks = []; let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > maxBytes) { ctl.abort(); throw Object.assign(new Error('That file is too big'), { status: 413 }); }
        chunks.push(value);
      }
      return { res, type, bytes: Buffer.concat(chunks.map((c) => Buffer.from(c))) };
    }
    throw Object.assign(new Error('Too many redirects'), { status: 502 });
  } finally { clearTimeout(timer); }
}
