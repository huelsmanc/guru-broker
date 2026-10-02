// Records an error for the platform owner's error list and alerts (see migration 0014).
// Never throws and never waits long: logging must not make a failure worse.
import crypto from 'node:crypto';
import { adminClient } from './base44.js';

/** Same error, different ids/numbers/quoted values -> same group. */
export function normalizeMessage(msg) {
  return String(msg || '')
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\b[0-9a-f]{20,}\b/gi, '<id>')
    .replace(/(["'`]).{1,120}?\1/g, '<s>')
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function fingerprintFor(source, location, message) {
  return crypto.createHash('sha1').update(`${source}|${String(location || '').replace(/\/[0-9a-f-]{8,}/gi, '/<id>')}|${normalizeMessage(message)}`).digest('hex');
}

/** Reads the signed-in person's email from their token, for "who hit this". Not a security check. */
export function emailFromRequest(req) {
  try {
    const h = req?.headers?.get('authorization') || '';
    const tok = h.toLowerCase().startsWith('bearer ') ? h.slice(7) : '';
    const part = tok.split('.')[1];
    if (!part) return null;
    const claims = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  } catch { return null; }
}

export async function logError({ source = 'server', location, message, detail, userEmail, url, userAgent, brokerageId }) {
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
    const msg = String(message || 'Unknown error').slice(0, 2000);
    const call = adminClient().rpc('log_app_error', {
      p_fingerprint: fingerprintFor(source, location, msg), p_source: source, p_location: location ? String(location).slice(0, 300) : null,
      p_message: msg, p_detail: detail ? String(detail).slice(0, 8000) : null, p_user_email: userEmail || null,
      p_url: url ? String(url).slice(0, 1000) : null, p_user_agent: userAgent ? String(userAgent).slice(0, 400) : null, p_brokerage_id: brokerageId || null,
    });
    const timeout = new Promise((resolve) => setTimeout(() => resolve({ data: null, error: { message: 'timeout' } }), 1500));
    const { data, error } = await Promise.race([call, timeout]);
    if (error) { console.error('logError failed:', error.message); return false; }
    return !!data;
  } catch (e) {
    console.error('logError failed:', e.message);
    return false;
  }
}
