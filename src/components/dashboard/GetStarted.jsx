// "Get set up" card on the Dashboard: the few things a new member should do first, each one tap
// away, ticking itself off as they're done. Disappears when everything is done (or when hidden).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, X, Share, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { enablePush, pushSupported, isIos, isInstalled } from '@/lib/push';
import { cn } from '@/lib/utils';

const isPhone = () => /iphone|ipad|ipod|android/i.test(navigator.userAgent);

export default function GetStarted({ user, brokerageName }) {
  const [hidden, setHidden] = useState(!!user?.getting_started_hidden);
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'));
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [showIos, setShowIos] = useState(false);
  useEffect(() => setHidden(!!user?.getting_started_hidden), [user?.getting_started_hidden]);

  const { data: openOnboarding = 0 } = useQuery({
    queryKey: ['my-onboarding-open', user?.email],
    queryFn: async () => {
      const lists = await base44.entities.Checklist.filter({ subject_type: 'onboarding', subject_email: String(user.email).toLowerCase() }, 'created_date', 10);
      return lists.reduce((n, l) => n + (l.items || []).filter((i) => !['done', 'approved', 'na', 'complete', 'completed'].includes(String(i.status || '').toLowerCase()) && !i.completed).length, 0);
    },
    enabled: !!user?.email,
  });

  if (!user || hidden) return null;
  const iosNeedsInstall = isIos() && !isInstalled();
  const steps = [
    { key: 'name', done: !!(user.display_name || user.full_name), title: 'Add your name', why: 'So your team knows who you are.', to: '/Profile' },
    { key: 'photo', done: !!user.headshot, title: 'Add your photo', why: 'Shown in chat and on your flyers, postcards and posts.', to: '/Marketing?tab=brand' },
    { key: 'contact', done: !!(user.phone && user.license_number), title: 'Add your phone and license number', why: 'Printed on everything you market.', to: '/Marketing?tab=brand' },
    ...(openOnboarding > 0 ? [{ key: 'onboarding', done: false, title: `Finish your onboarding checklist (${openOnboarding} left)`, why: `What ${brokerageName || 'your brokerage'} needs from you to get started.`, to: '/Profile#onboarding' }] : []),
    ...(pushSupported() || iosNeedsInstall ? [{
      key: 'alerts', done: perm === 'granted' && !iosNeedsInstall,
      title: iosNeedsInstall ? 'Add the app to your home screen' : 'Turn on notifications',
      why: iosNeedsInstall ? 'On iPhone, alerts for messages and calls only work from the home-screen app.' : 'Get messages, calls and approvals even when the app is closed.',
      action: true,
    }] : []),
  ];
  const left = steps.filter((s) => !s.done).length;
  if (!left) return null;

  const hide = async () => {
    setHidden(true);
    try { await base44.auth.updateMe({ getting_started_hidden: true }); } catch { /* it just shows again next time */ }
  };
  const turnOnAlerts = async () => {
    if (iosNeedsInstall) { setShowIos((v) => !v); return; }
    setPushBusy(true); setPushMsg('');
    const r = await enablePush(user).catch(() => 'error');
    setPushBusy(false);
    if (r === 'on') setPerm('granted');
    else setPushMsg({ denied: 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.', unsupported: "This browser can't show notifications.", 'not-configured': "Notifications aren't set up yet. Your broker is on it." }[r] || 'Something went wrong. Try again.');
  };

  return (
    <section className="mb-6 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1">
          <p className="font-semibold">{brokerageName ? `Get set up at ${brokerageName}` : 'Get set up'}</p>
          <p className="text-sm text-muted-foreground">{left === 1 ? 'One thing left.' : `${left} quick things.`} Each takes about a minute.</p>
        </div>
        <button onClick={hide} className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:bg-muted" aria-label="Hide for now" title="Hide"><X className="w-4 h-4" /></button>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 mb-3"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round(((steps.length - left) / steps.length) * 100)}%` }} /></div>
      <ul className="divide-y">
        {steps.map((s) => {
          const body = (
            <>
              <span className={cn('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border', s.done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300')}>{s.done && <Check className="w-3.5 h-3.5" />}</span>
              <span className="flex-1 min-w-0">
                <span className={cn('block text-sm font-medium', s.done && 'text-muted-foreground line-through')}>{s.title}</span>
                {!s.done && <span className="block text-xs text-muted-foreground">{s.why}</span>}
              </span>
              {!s.done && (s.key === 'alerts' && pushBusy ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />)}
            </>
          );
          const cls = 'w-full flex items-center gap-3 py-3 text-left min-h-[52px]';
          return (
            <li key={s.key}>
              {s.done ? <div className={cls}>{body}</div>
                : s.action ? <button onClick={turnOnAlerts} className={cls}>{body}</button>
                  : <Link to={s.to} className={cls}>{body}</Link>}
              {s.key === 'alerts' && showIos && (
                <p className="text-xs text-muted-foreground pb-3 pl-9">In Safari, tap <Share className="inline w-3.5 h-3.5 -mt-0.5" /> <b>Share</b>, then <b>Add to Home Screen</b>. Open the app from your home screen and come back here to turn on notifications.</p>
              )}
              {s.key === 'alerts' && pushMsg && <p className="text-xs text-amber-700 pb-3 pl-9">{pushMsg}</p>}
            </li>
          );
        })}
      </ul>
      {isPhone() && !isInstalled() && !iosNeedsInstall && <p className="text-xs text-muted-foreground mt-2">Tip: add this app to your home screen from your browser's menu for one-tap access.</p>}
    </section>
  );
}
