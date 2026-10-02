// iPhone app only: lock Guru Broker with Face ID (or Touch ID) when it's opened or left for 5 minutes.
import React, { useEffect, useState } from 'react';
import { ScanFace } from 'lucide-react';
import { biometricKind, faceIdLockOn, setFaceIdLock, isNative } from '@/lib/native';

export default function FaceIdLock() {
  const [kind, setKind] = useState(null);
  const [on, setOn] = useState(faceIdLockOn());
  const [msg, setMsg] = useState('');
  useEffect(() => { if (isNative()) biometricKind().then(setKind); }, []);
  if (!kind) return null;
  const toggle = async () => {
    setMsg('');
    try { await setFaceIdLock(!on); setOn(!on); }
    catch { setMsg(`${kind} didn't confirm, so nothing changed.`); }
  };
  return (
    <div className="rounded-2xl border p-5 flex items-start gap-3">
      <ScanFace className="w-5 h-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">Lock with {kind}</p>
        <p className="text-sm text-muted-foreground">Ask for {kind} when the app opens or after 5 minutes away, on this phone.</p>
        {msg && <p className="text-xs text-amber-700 mt-1">{msg}</p>}
      </div>
      <button role="switch" aria-checked={on} onClick={toggle} className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
