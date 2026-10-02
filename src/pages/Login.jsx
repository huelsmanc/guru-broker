import React, { useState } from 'react';
import { supabase } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Sign in, create an account, magic link, and forgot password.
// Everyone moved over from Base44 uses "Email me a sign-in link" (or "Forgot password")
// the first time, because Base44 can't export passwords.
export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const rawNext = params.get('next') || '';
  // Only allow same-site paths, so a crafted link can't bounce people to another site.
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : '/Dashboard';
  const [mode, setMode] = useState('signin'); // signin | signup | magic | forgot
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const redirectTo = `${window.location.origin}${next}`;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = next;
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setNotice('Check your email to confirm your account.');
      } else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        setNotice('We emailed you a sign-in link.');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setNotice('We emailed you a link to set a new password.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const titles = {
    signin: 'Sign in',
    signup: 'Create your account',
    magic: 'Email me a sign-in link',
    forgot: 'Reset your password',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h1 className="text-xl font-semibold text-slate-900 mb-1">{titles[mode]}</h1>
        <p className="text-sm text-slate-500 mb-6">Go Broker Hub</p>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {(mode === 'signin' || mode === 'signup') && (
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {notice && <p className="text-sm text-emerald-700">{notice}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Please wait…' : titles[mode]}
          </Button>
        </form>
        <div className="mt-6 space-y-2 text-sm text-center">
          {mode !== 'magic' && (
            <button className="block w-full text-slate-600 hover:text-slate-900" onClick={() => setMode('magic')}>
              Email me a sign-in link instead
            </button>
          )}
          {mode !== 'forgot' && (
            <button className="block w-full text-slate-600 hover:text-slate-900" onClick={() => setMode('forgot')}>
              Forgot password?
            </button>
          )}
          {mode !== 'signin' && (
            <button className="block w-full text-slate-600 hover:text-slate-900" onClick={() => setMode('signin')}>
              Back to sign in
            </button>
          )}
          {mode === 'signin' && (
            <button className="block w-full text-slate-600 hover:text-slate-900" onClick={() => setMode('signup')}>
              New here? Create an account
            </button>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400"><a href="/privacy" className="hover:text-slate-600">Privacy</a> · <a href="/support" className="hover:text-slate-600">Help</a></p>
      </div>
    </div>
  );
}
