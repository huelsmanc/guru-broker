import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, MailCheck } from 'lucide-react';
import { base44, supabase } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Where the invite email ("welcome=1") and the "forgot password" email land.
// New members are greeted by name and brokerage and can add their name; an expired or
// already-used link (email scanners often open links first) gets a one-tap way to a new one.
const params = new URLSearchParams(window.location.search);
const WELCOME = params.get('welcome') === '1';
const rawNext = params.get('next') || '';
const NEXT = /^\/(?!\/)/.test(rawNext) ? rawNext : '/Dashboard';
const hashInfo = new URLSearchParams(String(window.__gbhHash || window.location.hash || '').replace(/^#/, ''));
const LINK_ERROR = hashInfo.get('error_code') || hashInfo.get('error') || '';

function Card({ children }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6">{children}</div>
    </div>
  );
}

async function waitForSession(ms = 2500) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

export default function ResetPassword() {
  const [stage, setStage] = useState('checking'); // checking | form | expired | sent
  const [me, setMe] = useState(null);
  const [brand, setBrand] = useState({ name: '', logo: '' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const session = LINK_ERROR ? null : await waitForSession();
      if (!session) { setStage('expired'); return; }
      setEmail(session.user?.email || '');
      try {
        const u = await base44.auth.me();
        setMe(u);
        setName([u.display_name, u.full_name].find((v) => v && !String(v).includes('@')) || '');
        if (u.brokerage_id) {
          const [s] = await base44.entities.BrokerageSettings.filter({ brokerage_id: u.brokerage_id }).catch(() => []);
          const b = s?.brokerage_name ? null : await base44.entities.Brokerage.get(u.brokerage_id).catch(() => null);
          setBrand({ name: s?.brokerage_name || b?.name || '', logo: s?.logo_url || b?.logo_url || '' });
        }
      } catch { /* the form still works without the greeting */ }
      setStage('form');
    })();
  }, []);

  const needsName = WELCOME && me && ![me.display_name, me.full_name].some((v) => v && !String(v).includes('@')); // an invite may hold only the email

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (needsName && !name.trim()) return setError('Add your name.');
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setBusy(false);
      if (/session|jwt|expired|not authenticated/i.test(err.message)) { setStage('expired'); return; }
      return setError(/different from the old/i.test(err.message) ? "That's your current password. Pick a new one." : err.message);
    }
    if (needsName) await base44.auth.updateMe({ full_name: name.trim(), display_name: name.trim() }).catch(() => {});
    window.location.href = NEXT;
  };

  const sendNewLink = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password?${WELCOME ? 'welcome=1&' : ''}next=${encodeURIComponent(NEXT)}`,
    });
    setBusy(false);
    if (err) return setError(/rate|seconds/i.test(err.message) ? 'Please wait a minute before asking for another link.' : err.message);
    setStage('sent');
  };

  if (stage === 'checking') {
    return <Card><div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Opening your link…</div></Card>;
  }

  if (stage === 'sent') {
    return (
      <Card>
        <MailCheck className="w-10 h-10 text-emerald-600 mb-3" />
        <h1 className="text-xl font-semibold text-slate-900">Check your email</h1>
        <p className="text-sm text-slate-600 mt-2">We sent a new link to <b>{email}</b>. Open it on this device; it works once and expires in about an hour.</p>
        <p className="text-xs text-slate-500 mt-4">Nothing after a few minutes? Check spam or promotions, or ask your broker to resend your invite.</p>
      </Card>
    );
  }

  if (stage === 'expired') {
    return (
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">This link has expired</h1>
        <p className="text-sm text-slate-600 mt-2 mb-5">Links work once and only for a while (some email apps open them before you do). Enter your email and we'll send a fresh one.</p>
        <form onSubmit={sendNewLink} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="em">Email</Label>
            <Input id="em" type="email" autoComplete="email" inputMode="email" className="text-base sm:text-sm h-11" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full h-11" disabled={busy}>{busy ? 'Sending…' : 'Email me a new link'}</Button>
        </form>
        <a href="/login" className="block text-center text-sm text-slate-600 hover:text-slate-900 mt-5">Already set a password? Sign in</a>
      </Card>
    );
  }

  const first = (name || '').trim().split(/\s+/)[0];
  return (
    <Card>
      {WELCOME && brand.logo && <img src={brand.logo} alt="" className="h-12 max-w-[200px] object-contain mb-4" />}
      <h1 className="text-xl font-semibold text-slate-900">
        {WELCOME ? (brand.name ? `Welcome to ${brand.name}` : 'Welcome aboard') : 'Set a new password'}
      </h1>
      <p className="text-sm text-slate-600 mt-1.5 mb-5">
        {WELCOME
          ? `${first ? `Hi ${first}! ` : ''}Create a password to finish setting up your account. You'll use it with ${email || 'your email'} to sign in.`
          : `Choose a new password for ${email || 'your account'}.`}
      </p>
      <form onSubmit={submit} className="space-y-4">
        {needsName && (
          <div className="space-y-1.5">
            <Label htmlFor="nm">Your name</Label>
            <Input id="nm" autoComplete="name" className="text-base sm:text-sm h-11" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" required />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="pw">{WELCOME ? 'Create a password' : 'New password'}</Label>
          <div className="relative">
            <Input id="pw" type={show ? 'text' : 'password'} minLength={8} autoComplete="new-password" className="text-base sm:text-sm h-11 pr-11" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-slate-800" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className={`text-xs ${password && password.length < 8 ? 'text-amber-700' : 'text-slate-500'}`}>At least 8 characters.{password.length > 0 && password.length < 8 ? ` ${8 - password.length} to go.` : ''}</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" className="w-full h-11" disabled={busy}>{busy ? 'Saving…' : WELCOME ? 'Create password and continue' : 'Save password'}</Button>
      </form>
    </Card>
  );
}
