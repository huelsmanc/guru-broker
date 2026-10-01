// Turns on phone/desktop push notifications for this browser.
import { base44 } from '@/api/base44Client';

const toKey = (b64) => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export async function registerSw() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('/sw.js'); } catch { return null; }
}

async function save(sub, user) {
  const j = sub.toJSON();
  const existing = await base44.entities.PushSubscription.filter({ endpoint: j.endpoint }, '-created_date', 1).catch(() => []);
  const row = { brokerage_id: user?.brokerage_id || null, user_email: String(user?.email || '').toLowerCase(), endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) };
  if (existing[0]) await base44.entities.PushSubscription.update(existing[0].id, row); else await base44.entities.PushSubscription.create(row);
}

/** Asks permission (must be called from a tap/click) and subscribes. Returns a status string. */
export async function enablePush(user) {
  if (!pushSupported()) return isIos() && !isInstalled() ? 'ios-install' : 'unsupported';
  const { data } = await base44.functions.invoke('pushKey', {});
  if (!data.configured) return 'not-configured';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = (await registerSw()) || (await navigator.serviceWorker.ready);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(data.publicKey) });
  await save(sub, user);
  return 'on';
}

/** On app load: keep this browser's subscription fresh if notifications are already allowed. */
export async function refreshPush(user) {
  if (!user || !pushSupported() || Notification.permission !== 'granted') return;
  const reg = await registerSw();
  if (!reg) return;
  try {
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { data } = await base44.functions.invoke('pushKey', {});
      if (!data.configured) return;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(data.publicKey) });
    }
    await save(sub, user);
  } catch { /* try again next load */ }
}
