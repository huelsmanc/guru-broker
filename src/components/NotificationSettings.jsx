import React, { useEffect, useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { enablePush, pushSupported, isIos, isInstalled } from '@/lib/push';
import { isNative, nativePushPermission } from '@/lib/native';

export const DEFAULT_PREFS = { push_messages: true, push_mentions: true, push_calls: true, push_updates: true, daily_digest: true };
const ROWS = [
  ['push_messages', 'Direct and group messages', 'A notification for each new message sent to you.'],
  ['push_mentions', '@mentions and thread replies', 'When someone mentions you or replies in your thread.'],
  ['push_calls', 'Incoming calls', 'Rings your phone or computer.'],
  ['push_updates', 'Deal and back-office updates', 'Approvals, payouts, offers, checklists and deadlines.'],
  ['daily_digest', 'Morning email digest', 'A short email at 8am if you have unread messages or mentions.'],
];

// Saved on your profile, so it applies on every device.
export default function NotificationSettings() {
  const [me, setMe] = useState(null);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  useEffect(() => { base44.auth.me().then((u) => { setMe(u); setPrefs({ ...DEFAULT_PREFS, ...(u.notify_prefs || {}) }); }); }, []);
  // In the iPhone app, permission comes from iOS ('granted' / 'denied' / 'prompt').
  useEffect(() => { if (isNative()) nativePushPermission().then((p) => setPerm(String(p).startsWith('prompt') ? 'default' : p)); }, []);
  const save = async (next) => {
    setPrefs(next); setBusy(true);
    try { await base44.entities.User.update(me.id, { notify_prefs: next }); setSaved(true); setTimeout(() => setSaved(false), 1500); } finally { setBusy(false); }
  };
  const turnOn = async () => { const r = await enablePush(me).catch(() => 'error'); setPerm(isNative() ? (r === 'on' ? 'granted' : r === 'denied' ? 'denied' : 'default') : Notification.permission); if (r === 'on') base44.functions.invoke('pushKey', { test: true }).catch(() => {}); else if (r === 'ios-install') window.alert('On iPhone: tap Share, then Add to Home Screen. Open the app from your home screen and turn notifications on there.'); };
  if (!me) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Bell className="w-5 h-5" /><h3 className="font-semibold flex-1">Notifications</h3>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : saved && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</span>}
      </div>
      <div className="rounded-xl border p-3 flex items-center gap-3 text-sm">
        <span className="flex-1">{perm === 'granted' ? 'Notifications are on for this device.' : isIos() && !isInstalled() ? 'On iPhone, add the app to your Home Screen first (Share → Add to Home Screen).' : perm === 'denied' ? (isNative() ? 'Notifications are off for Guru Broker. Turn them on in Settings → Notifications → Guru Broker.' : 'Notifications are blocked in this browser\'s settings.') : 'Notifications are off on this device.'}</span>
        {perm !== 'granted' && pushSupported() && perm !== 'denied' && <Button size="sm" onClick={turnOn}>Turn on</Button>}
        {perm === 'granted' && <Button size="sm" variant="outline" onClick={() => base44.functions.invoke('pushKey', { test: true })}>Send a test</Button>}
      </div>
      <ul className="divide-y rounded-xl border">
        {ROWS.map(([k, l, d]) => (
          <li key={k} className="flex items-center gap-3 p-3">
            <div className="flex-1"><p className="text-sm font-medium">{l}</p><p className="text-xs text-muted-foreground">{d}</p></div>
            <Switch checked={prefs[k] !== false} onCheckedChange={(v) => save({ ...prefs, [k]: v })} />
          </li>
        ))}
      </ul>
    </div>
  );
}
