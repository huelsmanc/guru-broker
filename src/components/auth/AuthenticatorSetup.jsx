import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Copy, Check } from 'lucide-react';
import { startAuthenticator, verifyAuthenticator } from '@/lib/twoStep';

/** Add an authenticator app: scan the QR code (or type the key), then enter the code it shows. */
export default function AuthenticatorSetup({ onVerified, onCancel }) {
  const [factor, setFactor] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    startAuthenticator().then((f) => live && setFactor(f)).catch((e) => live && setError(e.message || 'Could not start. Try again.'));
    return () => { live = false; };
  }, []);

  const verify = async (e) => {
    e?.preventDefault();
    if (code.replace(/\D/g, '').length !== 6) return;
    setBusy(true); setError('');
    try { await verifyAuthenticator(factor.id, code); await onVerified?.(); }
    catch (err) { setError(err.message); setCode(''); }
    finally { setBusy(false); }
  };

  if (!factor) return error ? <p className="text-sm text-red-600">{error}</p> : <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  return (
    <form onSubmit={verify} className="space-y-3">
      <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-1">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).</li>
        <li>Add an account and scan this code.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div className="flex justify-center"><img src={factor.qr} alt="QR code for your authenticator app" className="w-44 h-44 bg-white p-2 rounded-lg border" /></div>
      <div className="text-xs text-center text-muted-foreground">
        Can't scan? Enter this key instead:
        <button type="button" className="ml-1 inline-flex items-center gap-1 font-mono text-foreground break-all"
          onClick={() => { navigator.clipboard?.writeText(factor.secret).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}>
          {factor.secret} {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
      <Input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} className="text-center text-lg tracking-[0.4em] h-11" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        {onCancel && <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Back</Button>}
        <Button type="submit" className="flex-1" disabled={busy || code.replace(/\D/g, '').length !== 6}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Turn on'}</Button>
      </div>
    </form>
  );
}
