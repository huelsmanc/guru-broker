// Settings: who signs training certificates, and their signature (drawn once, kept private).
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Award, Loader2, CheckCircle } from 'lucide-react';
import SignatureDraw from './SignatureDraw';

export default function CertificateSigner() {
  const [s, setS] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.functions.invoke('training', { action: 'signer' }).then(({ data }) => setS(data)).catch(() => setS({ name: '', title: '', signature_url: null }));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await base44.functions.invoke('training', { action: 'set_signer', name: s.name, title: s.title, ...(sig ? { signature: sig } : {}) });
      setS(data); setSig(''); setDrawing(false); setSaved(true); setTimeout(() => setSaved(false), 3000);
    } catch (e) { window.alert(e.message); } finally { setBusy(false); }
  };

  if (!s) return null;
  return (
    <div className="bg-card rounded-2xl border border-border p-6 space-y-4 mt-6">
      <div>
        <h3 className="font-semibold flex items-center gap-2"><Award className="w-4 h-4 text-primary" /> Training certificates</h3>
        <p className="text-sm text-muted-foreground mt-1">Agents who pass a class or quiz get a certificate signed by this person.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><Label>Signed by</Label><Input className="mt-1.5" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="e.g. Jane Smith" /></div>
        <div><Label>Title</Label><Input className="mt-1.5" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} placeholder="e.g. Broker of Record" /></div>
      </div>
      <div>
        <Label>Signature</Label>
        {drawing ? (
          <div className="mt-1.5"><SignatureDraw onChange={setSig} /></div>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {s.signature_url
              ? <img src={s.signature_url} alt="Signature" className="h-14 max-w-[240px] object-contain rounded border bg-white px-2" />
              : <p className="text-sm text-muted-foreground">None yet. Until you draw one, the name is printed in script.</p>}
            <Button variant="outline" size="sm" onClick={() => setDrawing(true)}>{s.signature_url ? 'Draw a new one' : 'Draw signature'}</Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy || (drawing && !sig)} className="gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Save certificate settings</Button>
        {drawing && <Button variant="ghost" onClick={() => { setDrawing(false); setSig(''); }}>Cancel</Button>}
        {saved && <span className="text-sm text-green-700 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Saved</span>}
      </div>
      <p className="text-xs text-muted-foreground">Certificates already issued keep the signature they were made with.</p>
    </div>
  );
}
