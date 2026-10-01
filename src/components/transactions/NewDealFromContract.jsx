import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Upload, Loader2, Sparkles, AlertTriangle, FileText, ArrowRight, Plus, X } from 'lucide-react';
import { DEADLINES } from '../../../shared/dealTimeline.js';
import { saveToContactBook } from '@/lib/contacts';

const DEAL_TYPES = [['buyer', 'Buyer side'], ['listing', 'Listing side'], ['dual', 'Both sides (dual)'], ['rental_tenant', 'Rental (tenant)'], ['rental_listing', 'Rental (landlord)'], ['referral', 'Referral']];

/**
 * Start a deal by dropping the signed contract: AI reads it, fills in the deal, people and
 * every deadline; the agent checks it and creates the deal. Or start blank.
 */
export default function NewDealFromContract({ open, onClose, user, brokerageId, brokerageUsers = [], isAdmin, onCreated }) {
  const input = useRef(null);
  const [files, setFiles] = useState([]);
  const [phase, setPhase] = useState('drop'); // drop | reading | review
  const [scan, setScan] = useState(null);
  const [f, setF] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [drag, setDrag] = useState(false);

  const reset = () => { setFiles([]); setPhase('drop'); setScan(null); setF(null); setError(null); };
  const close = () => { reset(); onClose(); };
  const blank = (extra = {}) => ({
    property_address: '', sale_price: '', deal_type: 'buyer', buyers: [''], sellers: [''],
    agent_email: user?.email || '', tc_email: '', earnest_money: '', financing_type: '',
    ...Object.fromEntries(DEADLINES.map((d) => [d.field, ''])), ...extra,
  });

  const read = async (list) => {
    const picked = [...(list || [])].filter((x) => /pdf|image/.test(x.type) || /\.(pdf|png|jpe?g|heic)$/i.test(x.name)).slice(0, 10);
    if (!picked.length) return;
    setFiles(picked); setPhase('reading'); setError(null);
    try {
      const urls = [];
      for (const file of picked) urls.push((await base44.integrations.Core.UploadFile({ file, scope: { kind: 'user', id: user.id } })).file_url);
      const res = await base44.functions.invoke('aiScanDocument', { file_urls: urls });
      const r = res.data.result || {};
      const d = r.dates || {};
      const mine = String(user?.email || '').toLowerCase();
      // Which side are we? The agent's name on the contract decides when it's clear.
      const me = String(user?.full_name || '').toLowerCase();
      const side = me && String(r.listing_agent || '').toLowerCase().includes(me.split(' ').pop()) ? 'listing' : 'buyer';
      setScan(r);
      setF(blank({
        property_address: [r.property_address, r.city, [r.state, r.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        sale_price: r.purchase_price ?? '', earnest_money: r.earnest_money ?? '', financing_type: r.financing_type || '',
        buyers: r.buyers?.length ? r.buyers : [''], sellers: r.sellers?.length ? r.sellers : [''],
        deal_type: side, agent_email: mine,
        ...Object.fromEntries(DEADLINES.map((x) => [x.field, d[x.field] || ''])),
      }));
      setPhase('review');
    } catch (err) {
      setError(err.message); setPhase('drop');
    }
  };

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setList = (k, i, v) => setF((x) => ({ ...x, [k]: x[k].map((y, j) => (j === i ? v : y)) }));

  const create = async () => {
    setCreating(true); setError(null);
    try {
      const agent = brokerageUsers.find((u) => u.email?.toLowerCase() === f.agent_email.toLowerCase());
      const tc = brokerageUsers.find((u) => u.email?.toLowerCase() === f.tc_email.toLowerCase());
      const buyers = f.buyers.map((b) => b.trim()).filter(Boolean);
      const sellers = f.sellers.map((b) => b.trim()).filter(Boolean);
      const data = {
        brokerage_id: brokerageId, status: 'active', updates: [],
        property_address: f.property_address.trim(), sale_price: f.sale_price === '' ? null : Number(String(f.sale_price).replace(/[^0-9.]/g, '')),
        deal_type: f.deal_type, transaction_type: 'purchase', buyers, sellers,
        agent_email: (f.agent_email || user.email).toLowerCase(), agent_name: agent?.display_name || agent?.full_name || (f.agent_email === user.email ? user.full_name : f.agent_email),
        ...(f.tc_email ? { tc_email: f.tc_email.toLowerCase(), tc_name: tc?.display_name || tc?.full_name || f.tc_email } : {}),
        ...(f.earnest_money !== '' ? { earnest_money: Number(String(f.earnest_money).replace(/[^0-9.]/g, '')) } : {}),
        ...(f.financing_type ? { financing_type: f.financing_type } : {}),
        ...Object.fromEntries(DEADLINES.map((d) => [d.field, f[d.field] || null])),
        ...(scan ? { ai_scan: { document_type: scan.document_type, summary: scan.summary, contingencies: scan.contingencies || [], issues: scan.issues || [] } } : {}),
      };
      const tx = await base44.entities.Transaction.create(data);
      // The contract goes in the deal's own folder (so the TC and broker can open it).
      const docs = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file, scope: { kind: 'tx', id: tx.id } });
        docs.push({ name: file.name, url: file_url, uploaded_at: new Date().toISOString(), uploaded_by: user.full_name || user.email, from_contract: true });
      }
      if (docs.length) await base44.entities.Transaction.update(tx.id, { documents: docs });
      // Buyers and sellers become the deal's contacts (and the agent's contacts).
      const ours = f.deal_type === 'listing' ? 'seller' : f.deal_type === 'dual' ? 'both' : 'buyer';
      for (const [list, role] of [[buyers, 'buyer'], [sellers, 'seller']]) {
        for (const name of list) {
          const book = await saveToContactBook(user, { name, type: role, source: 'deal' }).catch(() => null);
          await base44.entities.TransactionContact.create({
            transaction_id: tx.id, brokerage_id: brokerageId, agent_email: data.agent_email, name, role,
            is_client: ours === 'both' || ours === role, ...(book?.id ? { contact_id: book.id } : {}),
          }).catch(() => {});
        }
      }
      reset();
      onCreated(tx);
    } catch (err) { setError(err.message); } finally { setCreating(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="w-[96vw] max-w-3xl max-h-[92dvh]">
        <DialogHeader><DialogTitle>New deal</DialogTitle></DialogHeader>
        {phase === 'drop' && (
          <div className="space-y-3">
            <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); read(e.dataTransfer.files); }}
              className={`block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60'}`}>
              <input ref={input} type="file" multiple accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => { const l = e.target.files; read(l); e.target.value = ''; }} />
              <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center mb-3"><Sparkles className="w-7 h-7" /></div>
              <p className="font-semibold text-lg">Drop the signed contract</p>
              <p className="text-sm text-muted-foreground mt-1">PDF or phone photos. AI fills in the property, price, people and every deadline; you check it before the deal is created.</p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><Upload className="w-4 h-4" /> Choose files</span>
            </label>
            <div className="text-center">
              <button type="button" className="text-sm text-muted-foreground hover:text-foreground underline" onClick={() => { setF(blank()); setPhase('review'); }}>No contract yet? Start a blank deal</button>
            </div>
          </div>
        )}

        {phase === 'reading' && (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="font-medium">Reading {files.length > 1 ? `${files.length} files` : files[0]?.name}…</p>
            <p className="text-sm text-muted-foreground">Finding the parties, price and deadlines. This takes about 20 seconds.</p>
          </div>
        )}

        {phase === 'review' && f && (
          <div className="space-y-5">
            {scan && (
              <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-transparent dark:from-emerald-950/20 p-3 text-sm space-y-2">
                <p className="flex items-start gap-2"><Sparkles className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" /><span><strong>{scan.document_type}.</strong> {scan.summary}</span></p>
                {scan.issues?.length > 0 && (
                  <ul className="space-y-0.5 pl-6">
                    {scan.issues.map((i, k) => <li key={k} className={`flex gap-1.5 ${i.severity === 'high' ? 'text-red-700' : 'text-amber-800'}`}><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{i.description}{i.page ? ` (page ${i.page})` : ''}</li>)}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground pl-6">Everything below came from the contract. Check it, then create the deal.</p>
              </div>
            )}

            <div className="grid sm:grid-cols-6 gap-3">
              <div className="sm:col-span-6"><Label>Property</Label><Input className="mt-1" value={f.property_address} onChange={set('property_address')} placeholder="12 Elm St, Hartford, CT 06103" /></div>
              <div className="sm:col-span-2"><Label>Price</Label><Input className="mt-1" inputMode="numeric" value={f.sale_price} onChange={set('sale_price')} /></div>
              <div className="sm:col-span-2"><Label>Earnest money</Label><Input className="mt-1" inputMode="numeric" value={f.earnest_money} onChange={set('earnest_money')} /></div>
              <div className="sm:col-span-2">
                <Label>We represent</Label>
                <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.deal_type} onChange={set('deal_type')}>
                  {DEAL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="sm:col-span-3"><PeopleList label="Buyer(s)" list={f.buyers} onChange={(i, v) => setList('buyers', i, v)} onAdd={() => setF((x) => ({ ...x, buyers: [...x.buyers, ''] }))} onRemove={(i) => setF((x) => ({ ...x, buyers: x.buyers.filter((_, j) => j !== i) }))} /></div>
              <div className="sm:col-span-3"><PeopleList label="Seller(s)" list={f.sellers} onChange={(i, v) => setList('sellers', i, v)} onAdd={() => setF((x) => ({ ...x, sellers: [...x.sellers, ''] }))} onRemove={(i) => setF((x) => ({ ...x, sellers: x.sellers.filter((_, j) => j !== i) }))} /></div>
              {isAdmin && (
                <div className="sm:col-span-3">
                  <Label>Agent</Label>
                  <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.agent_email} onChange={set('agent_email')}>
                    <option value={user.email}>{user.full_name || user.email} (me)</option>
                    {brokerageUsers.filter((u) => u.email !== user.email).map((u) => <option key={u.id || u.email} value={u.email}>{u.display_name || u.full_name || u.email}</option>)}
                  </select>
                </div>
              )}
              <div className="sm:col-span-3">
                <Label>Transaction coordinator</Label>
                <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.tc_email} onChange={set('tc_email')}>
                  <option value="">None</option>
                  {brokerageUsers.map((u) => <option key={u.id || u.email} value={u.email}>{u.display_name || u.full_name || u.email}</option>)}
                </select>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">Deadlines</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {DEADLINES.map((d) => (
                  <div key={d.field}>
                    <Label className="text-xs">{d.label}</Label>
                    <Input className={`mt-1 ${scan && f[d.field] ? 'border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`} type="date" value={f[d.field] || ''} onChange={set(d.field)} />
                  </div>
                ))}
              </div>
              {scan?.contingencies?.length > 0 && <p className="text-xs text-muted-foreground mt-2">Contingencies: {scan.contingencies.join('; ')}</p>}
            </div>

            {files.length > 0 && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> {files.map((x) => x.name).join(', ')} will be added to the deal's documents.</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2">
              <Button variant="ghost" onClick={reset}>Start over</Button>
              <Button onClick={create} disabled={creating || !f.property_address.trim()} className="gap-1.5">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Create deal
              </Button>
            </div>
          </div>
        )}
        {error && phase === 'drop' && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}

function PeopleList({ label, list, onChange, onAdd, onRemove }) {
  return (
    <div>
      <div className="flex items-center justify-between"><Label>{label}</Label><button type="button" onClick={onAdd} className="text-xs text-primary inline-flex items-center gap-0.5"><Plus className="w-3 h-3" /> Add</button></div>
      <div className="space-y-1.5 mt-1">
        {list.map((n, i) => (
          <div key={i} className="flex gap-1">
            <Input value={n} onChange={(e) => onChange(i, e.target.value)} placeholder="Full name" />
            {list.length > 1 && <Button type="button" size="icon" variant="ghost" onClick={() => onRemove(i)} aria-label="Remove"><X className="w-4 h-4" /></Button>}
          </div>
        ))}
      </div>
    </div>
  );
}
