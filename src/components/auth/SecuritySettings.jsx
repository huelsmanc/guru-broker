import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck, Smartphone, Monitor, Trash2, LogOut } from 'lucide-react';
import { supabase } from '@/api/base44Client';
import { twoStep, authenticatorFactors, verifyAuthenticator, removeAuthenticator, getDeviceToken, forgetDeviceToken } from '@/lib/twoStep';
import AuthenticatorSetup from './AuthenticatorSetup';

const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');

/** Profile > Sign-in security: 2-step sign-in, authenticator app, trusted devices, sign out everywhere. */
export default function SecuritySettings({ user }) {
  const [status, setStatus] = useState(null);
  const [factors, setFactors] = useState([]);
  const [devices, setDevices] = useState([]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null); // factor being removed: asks for a current code
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, f, d] = await Promise.all([twoStep('status'), authenticatorFactors().catch(() => []), twoStep('devices').catch(() => ({ devices: [] }))]);
      setStatus(s); setFactors(f); setDevices(d.devices || []);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (label, fn) => {
    setBusy(label); setError('');
    try { await fn(); await load(); } catch (e) { setError(e.message || 'Could not do that.'); } finally { setBusy(''); }
  };

  const required = status?.needed && !status?.mine;
  const on = status?.needed;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-primary mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold">Sign-in security</h3>
          <p className="text-sm text-muted-foreground">2-step sign-in asks for a code from your phone or email after your password, so a stolen password isn't enough to get in.</p>
        </div>
      </div>

      {!status ? <Loader2 className="w-5 h-5 animate-spin" /> : (
        <>
          <div className="rounded-xl border p-3 flex flex-wrap items-center gap-3 justify-between">
            <div>
              <p className="text-sm font-medium">2-step sign-in: <span className={on ? 'text-green-700' : 'text-muted-foreground'}>{on ? 'On' : 'Off'}</span></p>
              {required && <p className="text-xs text-muted-foreground">Required for your role or by your brokerage.</p>}
            </div>
            {!required && (
              <Button size="sm" variant={on ? 'outline' : 'default'} disabled={!!busy}
                onClick={() => run('mine', () => twoStep('set_mine', { enabled: !on }))}>
                {busy === 'mine' ? <Loader2 className="w-4 h-4 animate-spin" /> : on ? 'Turn off' : 'Turn on'}
              </Button>
            )}
          </div>

          <div className="rounded-xl border p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Authenticator app</p>
                  <p className="text-xs text-muted-foreground">{factors.length ? `Set up ${when(factors[0].created_at)}` : 'Not set up. You can use emailed codes instead.'}</p>
                </div>
              </div>
              {factors.length > 0
                ? !removing && <Button size="sm" variant="outline" onClick={() => { setRemoving(factors[0]); setCode(''); setError(''); }}>Remove</Button>
                : !adding && <Button size="sm" onClick={() => { setAdding(true); setError(''); }}>Set up</Button>}
            </div>
            {adding && <AuthenticatorSetup onVerified={async () => { await twoStep('totp_done').catch(() => {}); setAdding(false); await load(); }} onCancel={() => setAdding(false)} />}
            {removing && (
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); run('remove', async () => { await verifyAuthenticator(removing.id, code); await twoStep('totp_done'); await removeAuthenticator(removing.id); setRemoving(null); }); }}>
                <p className="text-sm">To remove it, enter the current code from the app.</p>
                <div className="flex gap-2">
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} className="text-center tracking-[0.3em]" />
                  <Button type="submit" variant="destructive" disabled={busy === 'remove' || code.replace(/\D/g, '').length !== 6}>{busy === 'remove' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}</Button>
                  <Button type="button" variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button>
                </div>
                <p className="text-xs text-muted-foreground">Lost your phone? Ask your broker to reset your 2-step sign-in.</p>
              </form>
            )}
          </div>

          <div className="rounded-xl border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Trusted devices</p>
              {devices.length > 0 && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run('forget_all', async () => { await twoStep('forget_devices'); forgetDeviceToken(user.id); })}>Forget all</Button>}
            </div>
            {devices.length === 0 ? <p className="text-xs text-muted-foreground">None. Check "Trust this device" when you confirm a sign-in to skip the code for 30 days.</p> : devices.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-sm">
                <Monitor className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate">{d.label}<span className="text-xs text-muted-foreground"> · added {when(d.created_at)}{d.last_used_at ? `, last used ${when(d.last_used_at)}` : ''}</span></span>
                <button type="button" aria-label="Forget this device" className="p-1.5 rounded hover:bg-muted text-muted-foreground" disabled={!!busy}
                  onClick={() => run('forget', async () => { await twoStep('forget_device', { id: d.id }); })}><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>

          <Button variant="outline" className="gap-1.5" disabled={!!busy}
            onClick={async () => {
              if (!window.confirm('Sign out on every phone and computer, including this one, and forget trusted devices?')) return;
              await twoStep('forget_devices').catch(() => {});
              if (getDeviceToken(user.id)) forgetDeviceToken(user.id);
              await supabase.auth.signOut({ scope: 'global' });
              window.location.href = '/login';
            }}>
            <LogOut className="w-4 h-4" /> Sign out everywhere
          </Button>
        </>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
