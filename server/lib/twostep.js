// 2-step sign-in: who must confirm a second step after signing in, and whether this sign-in has.
// Mirrors public.second_step_needed / second_step_ok in the database (0010_two_step.sql), so the
// server routes (which read with full access) apply the same rule as the database does.
import { createHash, randomBytes } from 'node:crypto';
import { can, normalizeRole } from '../../shared/permissions.generated.js';

// How long a confirmed sign-in lasts before asking again (the same sign-in, refreshed tokens and all).
export const CONFIRM_DAYS = 14;
// "Trust this device" lasts this long.
export const DEVICE_DAYS = 30;

export const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');

// The sign-in token's claims. Only used after Supabase has confirmed the token is genuine.
export function tokenClaims(token) {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

/** Must this person confirm a second step? `row` is their raw profiles row. */
export async function secondStepNeeded(admin, row) {
  if (!row) return false;
  const extra = row.extra || {};
  if (extra.mfa_enabled === true || extra.mfa_enabled === 'true') return true;
  if (row.role === 'super_admin' || ['owner', 'broker', 'office_admin'].includes(normalizeRole(row.role))) return true;
  if (can({ role: row.role, permissions: row.permissions || {} }, 'accounting.access')) return true;
  if (!row.brokerage_id) return false;
  const { data } = await admin.from('brokerage_settings').select('extra').eq('brokerage_id', row.brokerage_id).order('created_date', { ascending: true }).range(0, 0);
  const rule = data?.[0]?.extra?.require_2fa_all;
  return rule === true || rule === 'true';
}

export const notInstalled = (error) => ['42P01', 'PGRST205'].includes(error?.code) || /does not exist|schema cache/i.test(error?.message || '');

/** Has this sign-in (token) confirmed its second step? */
export async function sessionConfirmed(admin, userId, claims) {
  if (claims?.aal === 'aal2') return true;
  const sid = claims?.session_id;
  if (!sid) return false;
  const { data, error } = await admin.from('second_step_session').select('user_id').eq('user_id', userId).eq('session_id', sid).gt('expires_at', new Date().toISOString());
  // Until the 2-step database update has been run there is nothing to check against (and the
  // database isn't enforcing it either), so don't lock anyone out.
  if (error && notInstalled(error)) return true;
  return (data || []).length > 0;
}

/** Records this sign-in as confirmed. */
export async function confirmSession(admin, userId, claims, method) {
  const sid = claims?.session_id;
  if (!sid) throw Object.assign(new Error('This sign-in has no session. Sign out and in again.'), { status: 400 });
  await admin.from('second_step_session').delete().eq('user_id', userId).eq('session_id', sid);
  const expires = new Date(Date.now() + CONFIRM_DAYS * 86400_000).toISOString();
  const { error } = await admin.from('second_step_session').insert({ user_id: userId, session_id: sid, method, expires_at: expires });
  if (error) throw new Error(error.message);
}

/** Issues a "trusted device" token. Only its hash is stored. */
export async function trustDevice(admin, userId, label) {
  const token = newToken();
  const { error } = await admin.from('trusted_device').insert({
    user_id: userId, token_hash: sha256(token), label: String(label || 'Browser').slice(0, 120),
    expires_at: new Date(Date.now() + DEVICE_DAYS * 86400_000).toISOString(), last_used_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}

/** Is this a live trusted-device token for this person? Returns the device row. */
export async function findDevice(admin, userId, token) {
  if (!token || typeof token !== 'string' || token.length < 32) return null;
  const { data } = await admin.from('trusted_device').select('*').eq('user_id', userId).eq('token_hash', sha256(token)).gt('expires_at', new Date().toISOString());
  return data?.[0] || null;
}
