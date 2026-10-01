import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck, Smartphone, Mail, LogOut } from 'lucide-react';
import { twoStep, authenticatorFactors, verifyAuthenticator, saveDeviceToken } from '@/lib/twoStep';
import AuthenticatorSetup from './AuthenticatorSetup';

/**
 * Shown after signing in when this person must confirm a second step (brokers, admins, accounting,
 * anyone who turned it on, or everyone if the brokerage requires it). Nothing loads until they do.
 */
export default function SecondStepGate({ user, status, onDone, onSignOut }) {
  const [factors, setFactors] = useState(null);
  const [mode, setMode] = useState(null); // 'app' | 'setup' | 'email' | 'choose'
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  useEffect(() => {
    authenticatorFactors()
      .then((f) => { setFactors(f); setMode(f.length ? 'app' : 'choose'); })
      .catch(() => { setFactors([]); setMode('choose'); });
  }, []);

  const finish = async (result) => {
    if (remember && result?.device_token) saveDeviceToken(user.id, result.device_token);
    await onDone();
  };

  const afterApp = async () => finish(await twoStep('totp_done', { remember }));

  const checkApp = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await verifyAuthenticator(factors[0].id, code); await afterApp(); }
    catch (err) { setError(err.message); setCode(''); }
    finally { setBusy(false); }
  };

  const sendEmail = async () => {
    setBusy(true); setError(''); setCode('');
    try { const r = await twoStep('email_send'); setSentTo(r.email || status?.email || 'your email'); setMode('email'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const checkEmail = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await finish(await twoStep('email_verify', { code, remember })); }
    catch (err) { setError(err.message); setCode(''); }
    finally { setBusy(false); }
  };

  const codeInput = (
    <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code}
      onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} className="text-center text-lg tracking-[0.4em] h-11" />
  );
  const rememberBox = (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      Trust this device for 30 days
    </label>
  );
  const six = code.replace(/\D/g, '').length === 6;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-sm bg-card border rounded-2xl shadow-sm p-6 space-y-4">
        <div className="text-center space-y-1">
          <div className="mx-auto w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center"><ShieldCheck className="w-6 h-6" /></div>
          <h1 className="text-lg font-semibold">Confirm it's you</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'setup' ? 'Set up your authenticator app.' : 'Your account uses 2-step sign-in to keep deals, pay and client details safe.'}
          </p>
        </div>

        {!mode && <div className="py-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>}

        {mode === 'app' && (
          <form onSubmit={checkApp} className="space-y-3">
            <p className="text-sm">Enter the 6-digit code from your authenticator app.</p>
            {codeInput}
            {rememberBox}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !six}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}</Button>
            <button type="button" className="w-full text-sm text-primary hover:underline" onClick={sendEmail} disabled={busy}>Lost your phone? Email me a code instead</button>
          </form>
        )}

        {mode === 'choose' && (
          <div className="space-y-2">
            <button type="button" onClick={() => { setError(''); setMode('setup'); }} className="w-full text-left rounded-xl border p-3 hover:border-primary flex gap-3">
              <Smartphone className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <span><span className="block text-sm font-medium">Authenticator app <span className="text-xs text-green-700">(recommended)</span></span>
                <span className="block text-xs text-muted-foreground">Set up once with your phone. Works offline.</span></span>
            </button>
            <button type="button" onClick={sendEmail} disabled={busy} className="w-full text-left rounded-xl border p-3 hover:border-primary flex gap-3">
              <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <span><span className="block text-sm font-medium">Email me a code</span>
                <span className="block text-xs text-muted-foreground">We'll send a 6-digit code to {status?.email || 'your email'}.</span></span>
            </button>
            {busy && <div className="flex justify-center"><Loader2 className="w-4 h-4 animate-spin" /></div>}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}

        {mode === 'setup' && (
          <div className="space-y-3">
            <AuthenticatorSetup onVerified={afterApp} onCancel={() => setMode('choose')} />
            {rememberBox}
          </div>
        )}

        {mode === 'email' && (
          <form onSubmit={checkEmail} className="space-y-3">
            <p className="text-sm">We emailed a code to <strong>{sentTo}</strong>. It works for 10 minutes.</p>
            {codeInput}
            {rememberBox}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || !six}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}</Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-primary hover:underline" onClick={sendEmail} disabled={busy}>Send a new code</button>
              {factors?.length > 0 ? <button type="button" className="text-primary hover:underline" onClick={() => { setError(''); setCode(''); setMode('app'); }}>Use my app</button>
                : <button type="button" className="text-primary hover:underline" onClick={() => { setError(''); setMode('choose'); }}>Other options</button>}
            </div>
          </form>
        )}

        <button type="button" onClick={onSignOut} className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-2 border-t">
          <LogOut className="w-3.5 h-3.5" /> Sign out ({user?.email})
        </button>
      </div>
    </div>
  );
}
