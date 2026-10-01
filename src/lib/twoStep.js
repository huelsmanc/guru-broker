// 2-step sign-in helpers for the browser.
import { base44, supabase } from '@/api/base44Client';

const key = (userId) => `gbh_device_${userId}`;
export function getDeviceToken(userId) {
  try { return localStorage.getItem(key(userId)) || null; } catch { return null; }
}
export function saveDeviceToken(userId, token) {
  try { if (token) localStorage.setItem(key(userId), token); } catch { /* private window */ }
}
export function forgetDeviceToken(userId) {
  try { localStorage.removeItem(key(userId)); } catch { /* ignore */ }
}

export const twoStep = (action, body = {}) => base44.functions.invoke('twoStep', { action, ...body }).then((r) => r.data);

/** { needed, ok, email, mine } for this sign-in. Uses this browser's trusted-device token if it has one. */
export async function secondStepStatus(userId) {
  const device = getDeviceToken(userId);
  const s = await twoStep('status', device ? { device } : {});
  if (device && s.needed && !s.ok) forgetDeviceToken(userId); // expired or forgotten
  return s;
}

/** Verified authenticator apps on this account. */
export async function authenticatorFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp || []).filter((f) => f.status === 'verified');
}

/** Starts adding an authenticator: { id, qr, secret }. Clears any half-finished one first. */
export async function startAuthenticator() {
  const { data: list } = await supabase.auth.mfa.listFactors();
  for (const f of list?.all || []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toLocaleDateString()}`, issuer: 'Guru Broker' });
  if (error) throw error;
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Checks a 6-digit authenticator code. On success this sign-in is fully confirmed (aal2). */
export async function verifyAuthenticator(factorId, code) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: String(code).replace(/\D/g, '') });
  if (error) throw new Error(/invalid|expired/i.test(error.message) ? "That code isn't right. Use the newest code in your app." : error.message);
}

export async function removeAuthenticator(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
