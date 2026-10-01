import React, { useEffect, useState } from 'react';
import { Bell, X, Share } from 'lucide-react';
import { enablePush, refreshPush, pushSupported, isIos, isInstalled } from '@/lib/push';

// Asks once to turn on phone/desktop notifications (messages, mentions, calls, approvals).
export default function PushNotificationBanner({ user }) {
  const [show, setShow] = useState(null); // 'ask' | 'ios'
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (!user) return undefined;
    refreshPush(user);
    let dismissed = false;
    try { dismissed = !!localStorage.getItem('pushBannerDismissed'); } catch { /* private mode */ }
    if (dismissed) return undefined;
    const t = setTimeout(() => {
      if (isIos() && !isInstalled()) setShow('ios');
      else if (pushSupported() && Notification.permission === 'default') setShow('ask');
    }, 2500);
    return () => clearTimeout(t);
  }, [user]);
  const close = () => { setShow(null); try { localStorage.setItem('pushBannerDismissed', '1'); } catch { /* ignore */ } };
  const enable = async () => {
    const r = await enablePush(user).catch(() => 'error');
    if (r === 'on') close();
    else setStatus({ denied: 'Notifications are blocked. Allow them in your browser settings.', 'not-configured': 'Push isn\'t set up on the server yet (see SETUP.md).', unsupported: 'This browser can\'t do push notifications.', error: 'Something went wrong. Try again.' }[r] || '');
  };
  if (!show) return null;
  return (
    <div className="fixed top-16 md:top-3 inset-x-3 md:left-auto md:right-4 md:w-[380px] z-[95] rounded-2xl bg-slate-900 text-white shadow-2xl p-4">
      <button onClick={close} className="absolute top-2 right-2 p-1 rounded hover:bg-white/10"><X className="w-4 h-4" /></button>
      {show === 'ios' ? (
        <>
          <p className="font-semibold flex items-center gap-2"><Bell className="w-4 h-4" /> Get alerts on your iPhone</p>
          <p className="text-sm text-white/80 mt-1">Tap <Share className="inline w-4 h-4 -mt-1" /> Share, then <b>Add to Home Screen</b>. Open Go Broker Hub from your home screen and turn on notifications for messages and calls.</p>
        </>
      ) : (
        <>
          <p className="font-semibold flex items-center gap-2"><Bell className="w-4 h-4" /> Turn on notifications</p>
          <p className="text-sm text-white/80 mt-1">Get messages, @mentions, calls and approvals on this device, even when the app is closed.</p>
          {status && <p className="text-xs text-amber-300 mt-2">{status}</p>}
          <div className="flex gap-2 mt-3"><button onClick={enable} className="rounded-full bg-emerald-500 hover:bg-emerald-600 px-4 py-1.5 text-sm font-medium">Turn on</button><button onClick={close} className="rounded-full px-3 py-1.5 text-sm text-white/70 hover:text-white">Not now</button></div>
        </>
      )}
    </div>
  );
}
