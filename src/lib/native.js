// When Guru Broker runs inside the iPhone app (Capacitor shell, see mobile/), this connects the
// web app to the phone: native push notifications, the share sheet for downloads, an in-app
// browser for outside links, opening gurubroker.app links in the app, and an optional Face ID lock.
// In a normal browser nothing here runs.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { base44, supabase } from '@/api/base44Client';

export const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };
export const platform = () => { try { return Capacitor.getPlatform(); } catch { return 'web'; } };

// Native plugins (installed in the app project, see mobile/package.json).
const Push = registerPlugin('PushNotifications');
const Share = registerPlugin('Share');
const Browser = registerPlugin('Browser');
const AppPlugin = registerPlugin('App');
const Filesystem = registerPlugin('Filesystem');
const Biometric = registerPlugin('NativeBiometric');
const StatusBar = registerPlugin('StatusBar');

// ---------------------------------------------------------------- push notifications
let pushListeners = false;
function listenForPush(user) {
  if (pushListeners) return;
  pushListeners = true;
  Push.addListener('registration', async ({ value }) => { try { await saveDevice(value, user); } catch { /* retried next launch */ } });
  Push.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const url = notification?.data?.url;
    if (url && /^\/(?!\/)/.test(url)) window.location.assign(url);
  });
}

async function saveDevice(token, user) {
  const endpoint = `apns:${token}`;
  const email = String(user?.email || '').toLowerCase();
  if (!email) return;
  const existing = await base44.entities.PushSubscription.filter({ endpoint }, '-created_date', 1).catch(() => []);
  const row = { brokerage_id: user?.brokerage_id || null, user_email: email, endpoint, p256dh: null, auth: null, user_agent: `Guru Broker ${platform()} app`, platform: platform() };
  if (existing[0]) await base44.entities.PushSubscription.update(existing[0].id, row);
  else await base44.entities.PushSubscription.create(row);
}

/** Asks for permission (from a tap) and registers this phone. Returns 'on' | 'denied' | 'error'. */
export async function enableNativePush(user) {
  try {
    listenForPush(user);
    let perm = await Push.checkPermissions();
    if (perm.receive !== 'granted') perm = await Push.requestPermissions();
    if (perm.receive !== 'granted') return 'denied';
    await Push.register();
    return 'on';
  } catch { return 'error'; }
}

/** On launch: if notifications were already allowed, refresh this phone's registration. */
export async function refreshNativePush(user) {
  try {
    listenForPush(user);
    const perm = await Push.checkPermissions();
    if (perm.receive === 'granted') await Push.register();
    return perm.receive;
  } catch { return 'error'; }
}
export async function nativePushPermission() { try { return (await Push.checkPermissions()).receive; } catch { return 'unsupported'; } }

// ---------------------------------------------------------------- files and sharing
const toBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); });
const cleanName = (n) => String(n || 'file').replace(/[^\w.\- ]+/g, '').slice(0, 80) || 'file';

/** Opens the share sheet for a file (Save to Files, Mail, Messages, Print, AirDrop...). */
export async function shareBlob(blob, name) {
  const path = `${Date.now()}-${cleanName(name)}`;
  const { uri } = await Filesystem.writeFile({ path, data: await toBase64(blob), directory: 'CACHE' });
  await Share.share({ title: cleanName(name), files: [uri] });
}

async function fetchWithSignIn(url) {
  const u = new URL(url, window.location.href);
  const headers = {};
  if (u.origin === window.location.origin) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  const res = await fetch(u.href, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(`Couldn't open the file (${res.status})`);
  const name = decodeURIComponent((res.headers.get('content-disposition') || '').match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] || u.pathname.split('/').pop() || 'file');
  return { blob: await res.blob(), name };
}

/** Opens a link from the app: our files go to the share sheet, everything else to the in-app browser. */
export async function openFromApp(href) {
  const u = new URL(href, window.location.href);
  if (u.origin === window.location.origin && u.pathname.startsWith('/api/file')) {
    const { blob, name } = await fetchWithSignIn(u.href);
    await shareBlob(blob, name);
    return;
  }
  if (u.protocol === 'mailto:' || u.protocol === 'tel:' || u.protocol === 'sms:') { window.location.href = u.href; return; }
  await Browser.open({ url: u.href, presentationStyle: 'popover' });
}

function interceptDownloadsAndLinks() {
  const fromAnchor = (a) => {
    const href = a.getAttribute('href') || '';
    if (a.hasAttribute('download') && /^(blob:|data:)/.test(href)) {
      fetch(href).then((r) => r.blob()).then((b) => shareBlob(b, a.getAttribute('download') || 'file')).catch((e) => window.alert(e.message));
      return true;
    }
    if (a.hasAttribute('download') || a.target === '_blank') {
      openFromApp(a.href).catch((e) => window.alert(e.message));
      return true;
    }
    return false;
  };
  // Links people tap.
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (a && fromAnchor(a)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // Downloads made in code (PDF and image exports): a link that's never added to the page.
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function patchedClick() { if (!fromAnchor(this)) click.call(this); };
  const dispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function patchedDispatch(ev) {
    if (ev?.type === 'click' && fromAnchor(this)) return false;
    return dispatch.call(this, ev);
  };
  // window.open: give back a stand-in window, so "open a tab, then set its address" still works.
  window.open = (url) => {
    let written = '';
    const go = (u) => { if (u && u !== 'about:blank') openFromApp(String(u)).catch((e) => window.alert(e.message)); };
    go(url);
    const loc = { set href(v) { go(v); }, assign: go, replace: go };
    return {
      closed: false, close() {}, focus() {},
      get location() { return loc; }, set location(v) { go(v); },
      document: { open() {}, write(h) { written += h; }, writeln(h) { written += `${h}\n`; }, close() { if (written) shareBlob(new Blob([written], { type: 'text/html' }), 'preview.html').catch(() => {}); } },
    };
  };
}

// ---------------------------------------------------------------- Face ID lock
const LOCK_KEY = 'gbh_faceid_lock';
const LOCK_AFTER_MS = 5 * 60 * 1000;
export const faceIdLockOn = () => { try { return localStorage.getItem(LOCK_KEY) === '1'; } catch { return false; } };
export async function biometricKind() {
  if (!isNative()) return null;
  // biometryType: 1 = Touch ID, 2 = Face ID
  try { const r = await Biometric.isAvailable(); return r.isAvailable ? (Number(r.biometryType) === 1 ? 'Touch ID' : 'Face ID') : null; } catch { return null; }
}
/** Turns the lock on (after a successful scan, so nobody locks themselves out) or off. */
export async function setFaceIdLock(on) {
  if (on) await Biometric.verifyIdentity({ reason: 'Turn on Face ID for Guru Broker', title: 'Guru Broker' });
  try { if (on) localStorage.setItem(LOCK_KEY, '1'); else localStorage.removeItem(LOCK_KEY); } catch { /* ignore */ }
}

let locked = false;
async function lockNow() {
  if (locked || !faceIdLockOn()) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return; // signed out: the sign-in page is the lock
  locked = true;
  const el = document.createElement('div');
  el.id = 'gbh-lock';
  el.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#0f172a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;font-family:Inter,system-ui,sans-serif;padding:24px;text-align:center');
  el.innerHTML = '<div style="font-size:22px;font-weight:700">Guru Broker is locked</div><button id="gbh-unlock" style="background:#fff;color:#0f172a;border:0;border-radius:12px;padding:12px 22px;font-size:16px;font-weight:600">Unlock</button><button id="gbh-signout" style="background:none;border:0;color:#94a3b8;font-size:14px;margin-top:8px">Sign out instead</button>';
  document.body.appendChild(el);
  const unlock = async () => {
    try {
      await Biometric.verifyIdentity({ reason: 'Unlock Guru Broker', title: 'Guru Broker' });
      el.remove(); locked = false;
    } catch { /* stays locked; they can tap Unlock again */ }
  };
  el.querySelector('#gbh-unlock').addEventListener('click', unlock);
  el.querySelector('#gbh-signout').addEventListener('click', async () => { await supabase.auth.signOut(); try { localStorage.removeItem(LOCK_KEY); } catch { /* ignore */ } window.location.href = '/login'; });
  unlock();
}

// ---------------------------------------------------------------- start-up
export function installNative() {
  if (!isNative()) return;
  document.documentElement.classList.add('native-app');
  StatusBar.setStyle({ style: 'DARK' }).catch(() => {}); // light text over the dark header
  interceptDownloadsAndLinks();
  // gurubroker.app links (emails, texts) open here instead of Safari.
  AppPlugin.addListener('appUrlOpen', ({ url }) => {
    try {
      const u = new URL(url);
      if (/(^|\.)gurubroker\.app$/i.test(u.hostname)) window.location.assign(`${u.pathname}${u.search}${u.hash}`);
    } catch { /* not a link we handle */ }
  });
  let away = 0;
  AppPlugin.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) { away = Date.now(); return; }
    if (away && Date.now() - away > LOCK_AFTER_MS) lockNow();
  });
  lockNow();
}
