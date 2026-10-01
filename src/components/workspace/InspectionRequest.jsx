import React, { useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, ScanLine, Upload, AlertTriangle, FileText, Send, Eye, CheckCircle2, Mail, ArrowRight } from 'lucide-react';
import UnifiedESignCreator from '@/components/esign/UnifiedESignCreator';
import { pdfPageTexts, chunkPages } from '@/lib/pdfText';

const SEV = {
  major: { label: 'Major', cls: 'bg-red-100 text-red-800 border-red-200' },
  moderate: { label: 'Moderate', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  minor: { label: 'Minor', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};
const FOCUS = [
  ['major', 'Major items only', ['major']],
  ['standard', 'Major + moderate', ['major', 'moderate']],
  ['all', 'Everything, including small items', ['major', 'moderate', 'minor']],
];
const ASKS = [['repair', 'Repair'], ['replace', 'Replace'], ['credit', 'Credit'], ['evaluate', 'Evaluate by a pro']];
const names = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.name : x)).filter(Boolean) : []);

/**
 * Inspection report -> inspection request. Scan the report, choose what to ask for (major
 * only, or include small items; everything else is still listed for reference), get the
 * buyers' signatures, then send it to the listing agent for the sellers' response.
 */
export default function InspectionRequest({ tx, user, contacts = [], refresh, onClose, existing }) {
  const [req, setReq] = useState(existing || null);
  const [phase, setPhase] = useState(existing ? (existing.status === 'draft' ? 'review' : 'done') : 'upload');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const [progress, setProgress] = useState('');
  // Reads the report's text here, then has the AI go through it a few pages at a time (big
  // reports would otherwise go over the AI account's per-minute limit). Scanned reports with
  // no text are sent whole.
  const scan = async ({ file, url, name }) => {
    setError(null); setPhase('scanning'); setProgress('Reading the report…');
    try {
      let fileUrl = url;
      if (file) fileUrl = (await base44.integrations.Core.UploadFile({ file, scope: { kind: 'tx', id: tx.id } })).file_url;
      let pages = [];
      try { pages = await pdfPageTexts(file || fileUrl, { onProgress: (n, t) => setProgress(`Reading page ${n} of ${t}…`) }); } catch { pages = []; }
      const chars = pages.reduce((s, p) => s + p.text.trim().length, 0);
      if (chars < 400) {
        setProgress('Reading the report with AI…');
        const res = await base44.functions.invoke('inspectionRequest', { action: 'scan', transactionId: tx.id, file_urls: [fileUrl], name: name || file?.name });
        setReq(res.data.request); setPhase('review'); refresh();
        return;
      }
      const chunks = chunkPages(pages);
      const items = []; let inspector = null; let inspectionDate = null;
      for (const [i, chunk] of chunks.entries()) {
        const label = `Finding issues: pages ${chunk[0].n}-${chunk[chunk.length - 1].n} of ${pages.length}${items.length ? ` (${items.length} found so far)` : ''}…`;
        setProgress(label);
        let res;
        for (let attempt = 0; ; attempt++) {
          try {
            res = await base44.functions.invoke('inspectionRequest', { action: 'scan_chunk', transactionId: tx.id, pages: chunk });
            break;
          } catch (err) {
            // The AI account's per-minute limit: wait and carry on.
            if (attempt < 5 && /rate limit|tokens per min|try again|429/i.test(err.message)) {
              const m = err.message.match(/try again in ([\d.]+)\s*s/i);
              const wait = Math.min(65, Math.max(10, m ? Number(m[1]) + 2 : 20 * (attempt + 1)));
              for (let t = wait; t > 0; t--) { setProgress(`${label} (pausing ${t}s for the AI's rate limit)`); await new Promise((r) => setTimeout(r, 1000)); }
              continue;
            }
            throw err;
          }
        }
        items.push(...(res.data.items || []));
        inspector = inspector || res.data.inspector; inspectionDate = inspectionDate || res.data.inspection_date;
        if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 400));
      }
      setProgress('Putting it together…');
      const res = await base44.functions.invoke('inspectionRequest', { action: 'scan_finish', transactionId: tx.id, items, inspector, inspection_date: inspectionDate, file_url: fileUrl, name: name || file?.name });
      setReq(res.data.request); setPhase('review'); refresh();
    } catch (err) { setError(err.message); setPhase('upload'); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[96vw] max-w-4xl h-[94dvh] max-h-[94dvh]">
        <DialogHeader><DialogTitle>Inspection request</DialogTitle></DialogHeader>
        {phase === 'upload' && (
          <div className="space-y-4">
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center hover:border-primary/60">
              <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) scan({ file: f }); }} />
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center mb-3"><ScanLine className="w-7 h-7" /></div>
              <p className="font-semibold text-lg">Upload the inspection report</p>
              <p className="text-sm text-muted-foreground mt-1">AI pulls out every finding, sorts it by how serious it is, and keeps the report page for each one.</p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Upload className="w-4 h-4" /> Choose PDF</span>
            </label>
            {(tx.documents || []).some((d) => /inspect/i.test(d.name || '')) && (
              <div>
                <p className="text-sm font-medium mb-1.5">Or use one already on the deal</p>
                <div className="flex flex-wrap gap-2">
                  {(tx.documents || []).filter((d) => /inspect/i.test(d.name || '')).map((d) => (
                    <button key={d.url} type="button" onClick={() => scan({ url: d.url, name: d.name })} className="text-sm rounded-lg border px-3 py-1.5 hover:border-primary flex items-center gap-1.5"><FileText className="w-4 h-4" /> {d.name}</button>
                  ))}
                </div>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
        {phase === 'scanning' && (
          <div className="py-20 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="font-medium">{progress || 'Reading the inspection report…'}</p>
            <p className="text-sm text-muted-foreground">Long reports can take a couple of minutes. Keep this window open.</p>
          </div>
        )}
        {phase === 'review' && req && (
          <Review tx={tx} req={req} onBuilt={(r) => { setReq(r); setPhase('sign'); refresh(); }} />
        )}
        {phase === 'sign' && req && (
          <UnifiedESignCreator user={user} brokerageId={tx.brokerage_id} transactionId={tx.id}
            initialTitle={`Inspection request - ${tx.property_address}`} initialDocumentUrl={req.pdf_url} initialFields={req.fields}
            initialSigners={contacts.filter((c) => /buyer/i.test(c.role || '') && c.email).map((c, i) => ({ id: `b${i}`, name: c.name, email: c.email }))
              .concat(contacts.some((c) => /buyer/i.test(c.role || '') && c.email) ? [] : names(tx.buyers).map((n, i) => ({ id: `n${i}`, name: n, email: '' })))}
            onCancel={() => setPhase('done')}
            onComplete={async (result) => {
              if (result?.submissionId) {
                const fresh = await base44.entities.Transaction.get(tx.id);
                await base44.entities.Transaction.update(tx.id, { inspection_requests: (fresh.inspection_requests || []).map((x) => (x.id === req.id ? { ...x, status: 'out_for_signature', submission_id: result.submissionId, esign_document_id: result.document?.id } : x)) });
                setReq((r) => ({ ...r, status: 'out_for_signature', submission_id: result.submissionId }));
                refresh();
              }
              setPhase('done');
            }} />
        )}
        {phase === 'done' && req && <SendToListing tx={tx} req={req} contacts={contacts} onSign={() => setPhase('sign')} onEdit={() => setPhase('review')} onSent={() => { refresh(); onClose(); }} busy={busy} setBusy={setBusy} />}
      </DialogContent>
    </Dialog>
  );
}

function Review({ tx, req, onBuilt }) {
  const [focus, setFocus] = useState('standard');
  const levels = FOCUS.find((f) => f[0] === focus)[2];
  const initial = useMemo(() => Object.fromEntries((req.items || []).map((i) => [i.id, { on: ['major', 'moderate'].includes(i.severity) && i.suggested_ask !== 'none', ask: i.suggested_ask === 'none' ? 'repair' : i.suggested_ask, note: '' }])), [req.items]);
  const [sel, setSel] = useState(() => (req.selected?.length ? Object.fromEntries((req.items || []).map((i) => { const s = req.selected.find((x) => x.id === i.id); return [i.id, s ? { on: true, ask: s.ask, note: s.note || '' } : { ...initial[i.id], on: false }]; })) : initial));
  const [credit, setCredit] = useState(req.credit || '');
  const [respondBy, setRespondBy] = useState(req.response_by || '');
  const [notes, setNotes] = useState(req.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const applyFocus = (f) => {
    setFocus(f);
    const lv = FOCUS.find((x) => x[0] === f)[2];
    setSel((s) => Object.fromEntries(Object.entries(s).map(([id, v]) => { const it = req.items.find((i) => i.id === id); return [id, { ...v, on: lv.includes(it.severity) && (it.suggested_ask !== 'none' || f === 'all') }]; })));
  };
  const count = (lv) => req.items.filter((i) => i.severity === lv).length;
  const chosen = req.items.filter((i) => sel[i.id]?.on);

  const build = async () => {
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.invoke('inspectionRequest', {
        action: 'build', transactionId: tx.id, requestId: req.id,
        selected: chosen.map((i) => ({ id: i.id, ask: sel[i.id].ask, note: sel[i.id].note })),
        credit: credit === '' ? null : Number(String(credit).replace(/[^0-9.]/g, '')), response_by: respondBy || null, notes: notes || null,
      });
      onBuilt({ ...req, status: 'ready', pdf_url: res.data.pdf_url, fields: res.data.fields });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-3 text-sm">
        <p>{req.summary}</p>
        <p className="text-xs text-muted-foreground mt-1">{req.items.length} findings · {count('major')} major · {count('moderate')} moderate · {count('minor')} minor{req.inspector ? ` · ${req.inspector}` : ''}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FOCUS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => applyFocus(k)} className={`rounded-full px-3 py-1.5 text-sm border ${focus === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:border-primary'}`}>{l}</button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Ticked items are requested. Everything else is still listed on the form for reference, with its page in the report.</p>
      {['major', 'moderate', 'minor'].map((lv) => {
        const list = req.items.filter((i) => i.severity === lv);
        if (!list.length) return null;
        return (
          <div key={lv}>
            <p className="text-sm font-semibold mb-1.5 flex items-center gap-2"><span className={`text-[11px] rounded border px-1.5 py-0.5 ${SEV[lv].cls}`}>{SEV[lv].label}</span> {list.length}{!levels.includes(lv) && <span className="text-xs font-normal text-muted-foreground">(not in focus; tick any you still want)</span>}</p>
            <ul className="space-y-1.5">
              {list.map((it) => {
                const v = sel[it.id] || {};
                return (
                  <li key={it.id} className={`rounded-lg border p-2.5 ${v.on ? 'bg-card border-primary/40' : 'bg-muted/20'}`}>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox" className="mt-1" checked={!!v.on} onChange={(e) => setSel((s) => ({ ...s, [it.id]: { ...s[it.id], on: e.target.checked } }))} />
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{it.title}</span>{it.location && <span className="text-xs text-muted-foreground"> · {it.location}</span>}
                        <span className="block text-xs text-muted-foreground">{it.description}</span>
                        {it.reference && <span className="block text-[11px] text-muted-foreground mt-0.5">Report: {it.reference}</span>}
                      </span>
                    </label>
                    {v.on && (
                      <div className="flex flex-wrap gap-2 mt-2 pl-6">
                        <select value={v.ask} onChange={(e) => setSel((s) => ({ ...s, [it.id]: { ...s[it.id], ask: e.target.value } }))} className="rounded-md border bg-background px-2 py-1 text-xs">
                          {ASKS.map(([a, l]) => <option key={a} value={a}>{l}</option>)}
                        </select>
                        <input value={v.note} onChange={(e) => setSel((s) => ({ ...s, [it.id]: { ...s[it.id], note: e.target.value } }))} placeholder="Note (optional)" className="flex-1 min-w-[160px] rounded-md border bg-background px-2 py-1 text-xs" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t">
        <div><Label>Or a credit instead ($, optional)</Label><Input className="mt-1" inputMode="numeric" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="5000" /></div>
        <div><Label>Seller response by</Label><Input className="mt-1" type="date" value={respondBy} onChange={(e) => setRespondBy(e.target.value)} /></div>
        <div className="sm:col-span-3"><Label>Anything else to say (optional)</Label><textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="sticky bottom-0 bg-background pt-2 pb-1 flex items-center justify-between gap-2 border-t">
        <p className="text-sm text-muted-foreground">{chosen.length} requested · {req.items.length - chosen.length} listed for reference</p>
        <Button onClick={build} disabled={busy || (!chosen.length && !credit)} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Create the request</Button>
      </div>
    </div>
  );
}

function SendToListing({ tx, req, contacts, onSign, onEdit, onSent, busy, setBusy }) {
  const la = contacts.find((c) => /listing agent/i.test(c.role || '') && c.email);
  const [to, setTo] = useState(req.sent_to || la?.email || tx.listing_agent_email || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);
  const send = async (allowUnsigned) => {
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.invoke('inspectionRequest', { action: 'send', transactionId: tx.id, requestId: req.id, to, message, allowUnsigned });
      if (res.data.status === 'sent') onSent();
    } catch (err) {
      if (/haven't finished signing/.test(err.message) && window.confirm('Your buyers haven\'t finished signing. Send the unsigned request anyway?')) { setBusy(false); return send(true); }
      setError(err.message);
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4 max-w-xl">
      <div className="rounded-xl border p-3 text-sm flex items-start gap-2">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-medium">{req.status === 'out_for_signature' ? 'Out to your buyers for signature' : req.status === 'sent' ? `Sent to ${req.sent_to}` : 'Request created'}</p>
          <p className="text-xs text-muted-foreground">{(req.selected || []).length} items requested{req.credit ? ` · or $${Number(req.credit).toLocaleString()} credit` : ''}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {req.pdf_url && <a href={req.pdf_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><Eye className="w-3.5 h-3.5" /> View</Button></a>}
            {!req.submission_id && <Button size="sm" variant="outline" className="gap-1.5" onClick={onSign}><Send className="w-3.5 h-3.5" /> Send to buyers to sign</Button>}
            {!req.submission_id && <Button size="sm" variant="ghost" onClick={onEdit}>Change items</Button>}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <p className="font-semibold flex items-center gap-1.5"><Mail className="w-4 h-4" /> Send to the listing agent</p>
        <p className="text-xs text-muted-foreground">Sends the buyer-signed copy for the sellers' response (the signed copy is used once everyone has signed).</p>
        <div><Label>Listing agent email</Label><Input className="mt-1" type="email" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><Label>Message (optional)</Label><textarea className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Leave empty for a short standard note" /></div>
        {error && <p className="text-sm text-destructive flex gap-1.5"><AlertTriangle className="w-4 h-4" /> {error}</p>}
        <Button onClick={() => send(false)} disabled={busy || !to} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Send to listing agent</Button>
      </div>
    </div>
  );
}
