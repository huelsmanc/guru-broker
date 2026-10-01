// Go Broker Hub service worker: shows push notifications (messages, mentions, calls,
// approvals) even when the app is closed, and opens the right screen when tapped.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'Go Broker Hub', body: event.data && event.data.text() }; }
  const call = d.kind === 'call';
  event.waitUntil(self.registration.showNotification(d.title || 'Go Broker Hub', {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: call,
    vibrate: call ? [400, 200, 400, 200, 400] : [120],
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/Dashboard' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/Dashboard', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) { await w.focus(); w.navigate(url).catch(() => {}); return; }
    }
    await self.clients.openWindow(url);
  })());
});
