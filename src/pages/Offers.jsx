import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Handshake, Plus, Sparkles, Loader2, Send, CheckCircle, XCircle, FileText, ArrowRight, Trash2, ShieldQuestion, Mail } from 'lucide-react';
import UnifiedESignCreator from '@/components/esign/UnifiedESignCreator';
import { textToPdfFile } from '@/lib/textToPdf';

const STATUS = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-700' },
  sent: { label: 'Out for signature', cls: 'bg-blue-100 text-blue-700' },
  submitted: { label: 'Sent to listing agent', cls: 'bg-indigo-100 text-indigo-700' },
  accepted: { label: 'Accepted', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
};

const REVIEW = {
  requested: { label: 'Broker review requested', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Broker approved', cls: 'bg-green-100 text-green-700' },
  changes_requested: { label: 'Changes requested', cls: 'bg-red-100 text-red-700' },
};

const EMPTY = {
  property_address: '', city: '', state: '', zip: '', mls_number: '',
  list_price: '', offer_price: '', earnest_money: '',
  financing_type: 'conventional', down_payment_percent: '20', loan_amount: '',
  closing_date: '', offer_expiration: '', inspection_days: '10', financing_days: '21',
  appraisal_contingency: true, seller_concessions: '', included_items: '', special_terms: '',
  buyers: [{ name: '', email: '' }], sellers: [{ name: '', email: '' }],
  listing_agent_name: '', listing_agent_email: '', offer_text: '',
};

const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(/[^0-9.]/g, '')));
const money = (v) => (v == null || v === '' ? '-' : `$${Number(v).toLocaleString('en-US')}`);

export default function Offers() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = ['admin', 'broker', 'super_admin'].includes(user?.role);
  const [editing, setEditing] = useState(null); // offer being edited (object) or null
  const [sending, setSending] = useState(null);
  const [accepting, setAccepting] = useState(null);
  const [emailing, setEmailing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [params] = useSearchParams();
  const openId = params.get('open');

  const review = async (o, action) => {
    const note = window.prompt(
      action === 'request' ? 'Anything you want the broker to look at? (optional)'
        : action === 'approve' ? 'Note for the agent (optional)' : 'What should the agent change?',
      '',
    );
    if (note === null) return;
    setBusy(o.id + action);
    try {
      await base44.functions.invoke('offerReview', { offerId: o.id, action, note });
      refresh();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setBusy(null);
    }
  };

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ['offers', brokerageId],
    queryFn: () => base44.entities.Offer.filter(isAdmin ? {} : { agent_email: user.email }, '-created_date', 200),
    enabled: !!brokerageId && !!user,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['offers', brokerageId] });

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Handshake className="w-6 h-6" /> Offer Builder</h1>
          <p className="text-sm text-muted-foreground">Write an offer with AI, send it to your buyers to sign, and open the transaction when it's accepted.</p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })} className="gap-2"><Plus className="w-4 h-4" /> New offer</Button>
      </div>

      {isLoading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : offers.length === 0 ? (
        <div className="border border-dashed rounded-xl p-10 text-center text-muted-foreground">
          No offers yet. Start one and AI will write it from your terms.
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((o) => {
            const st = STATUS[o.status] || STATUS.draft;
            return (
              <div key={o.id} ref={(el) => el && o.id === openId && el.scrollIntoView({ block: 'center' })}
                className={`rounded-xl border bg-card p-4 ${o.id === openId ? 'border-primary ring-2 ring-primary/30' : 'border-border/60'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{o.property_address}{o.city ? `, ${o.city}` : ''}</p>
                    <p className="text-sm text-muted-foreground">
                      Offer {money(o.offer_price)}{o.list_price ? ` · list ${money(o.list_price)}` : ''} · {(o.buyers || []).map((b) => b.name || b).filter(Boolean).join(', ') || 'no buyer yet'}
                    </p>
                    {isAdmin && o.agent_name && <p className="text-xs text-muted-foreground">Agent: {o.agent_name}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${st.cls}`}>{st.label}</span>
                    {REVIEW[o.review_status] && (
                      <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${REVIEW[o.review_status].cls}`}>{REVIEW[o.review_status].label}</span>
                    )}
                  </div>
                </div>
                {o.review_note && o.review_status && o.review_status !== 'requested' && (
                  <p className="mt-2 text-xs rounded-md bg-muted/60 px-3 py-2"><span className="font-medium">Broker note:</span> {o.review_note}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  {o.status !== 'accepted' && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(o)}>Edit</Button>
                  )}
                  {o.offer_text && o.status !== 'accepted' && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSending(o)}>
                      <Send className="w-3.5 h-3.5" /> {o.submission_id ? 'Send again' : 'Send to buyers to sign'}
                    </Button>
                  )}
                  {o.document_url && (
                    <a href={o.document_url} target="_blank" rel="noreferrer"><Button size="sm" variant="ghost" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> PDF</Button></a>
                  )}
                  {o.status !== 'accepted' && o.status !== 'rejected' && o.review_status !== 'requested' && (o.agent_email === user.email) && (
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={busy === o.id + 'request'} onClick={() => review(o, 'request')}>
                      {busy === o.id + 'request' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldQuestion className="w-3.5 h-3.5" />} Request broker review
                    </Button>
                  )}
                  {isAdmin && o.review_status === 'requested' && (
                    <>
                      <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={() => review(o, 'approve')}><CheckCircle className="w-3.5 h-3.5" /> Approve</Button>
                      <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => review(o, 'changes')}>Request changes</Button>
                    </>
                  )}
                  {(o.document_url || o.submission_id) && o.status !== 'accepted' && o.status !== 'rejected' && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEmailing(o)}>
                      <Mail className="w-3.5 h-3.5" /> {o.status === 'submitted' ? 'Email listing agent again' : 'Send to listing agent'}
                    </Button>
                  )}
                  {o.status !== 'accepted' && o.status !== 'rejected' && (
                    <>
                      <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => setAccepting(o)}>
                        <CheckCircle className="w-3.5 h-3.5" /> Offer accepted
                      </Button>
                      <Button size="sm" variant="ghost" className="gap-1.5 text-red-600"
                        onClick={async () => { await base44.entities.Offer.update(o.id, { status: 'rejected' }); refresh(); }}>
                        <XCircle className="w-3.5 h-3.5" /> Rejected
                      </Button>
                    </>
                  )}
                  {o.transaction_id && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/Transactions?open=${o.transaction_id}`)}>
                      Open transaction <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <OfferEditor
          offer={editing}
          user={user}
          brokerageId={brokerageId}
          onClose={() => setEditing(null)}
          onSaved={(saved, next) => { refresh(); setEditing(null); if (next === 'send') setSending(saved); }}
        />
      )}

      {sending && (
        <SendOffer offer={sending} user={user} brokerageId={brokerageId}
          onClose={() => setSending(null)} onSent={() => { setSending(null); refresh(); }} />
      )}

      {emailing && (
        <EmailListingAgent offer={emailing} onClose={() => setEmailing(null)} onSent={() => { setEmailing(null); refresh(); }} />
      )}

      {accepting && (
        <AcceptOffer offer={accepting} brokerageId={brokerageId}
          onClose={() => setAccepting(null)}
          onDone={(txId) => { setAccepting(null); refresh(); navigate(`/Transactions?open=${txId}`); }} />
      )}
    </div>
  );
}

function PartyList({ label, value, onChange }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {value.map((p, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder="Full name" value={p.name} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <Input placeholder="Email (for signing)" type="email" value={p.email} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
          {value.length > 1 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 className="w-4 h-4" /></Button>
          )}
        </div>
      ))}
      <button type="button" className="text-xs text-primary hover:underline" onClick={() => onChange([...value, { name: '', email: '' }])}>+ Add another</button>
    </div>
  );
}

function OfferEditor({ offer, user, brokerageId, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    ...EMPTY,
    ...offer,
    buyers: (offer.buyers?.length ? offer.buyers : EMPTY.buyers).map((b) => (typeof b === 'string' ? { name: b, email: '' } : b)),
    sellers: (offer.sellers?.length ? offer.sellers : EMPTY.sellers).map((b) => (typeof b === 'string' ? { name: b, email: '' } : b)),
  }));
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const [looking, setLooking] = useState(false);

  // Fill property details from the synced MLS listing.
  const lookup = async () => {
    setLooking(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('mlsSearch', { mls_number: f.mls_number });
      const l = res.data.listing;
      if (!l) { setError('That MLS number isn\'t in the synced MLS data yet.'); return; }
      setF((x) => ({
        ...x,
        property_address: [l.street_address, l.unit ? `#${l.unit}` : null].filter(Boolean).join(' ') || x.property_address,
        city: l.city || x.city, state: l.state || x.state, zip: l.zip || x.zip,
        list_price: l.list_price ?? x.list_price,
        listing_agent_name: l.list_agent_name || x.listing_agent_name,
        listing_agent_email: l.list_agent_email || x.listing_agent_email,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLooking(false);
    }
  };

  // Loan amount follows price and down payment unless typed.
  const suggestedLoan = useMemo(() => {
    const p = num(f.offer_price); const d = num(f.down_payment_percent);
    return p && d != null && f.financing_type !== 'cash' ? Math.round(p * (1 - d / 100)) : null;
  }, [f.offer_price, f.down_payment_percent, f.financing_type]);

  const payload = () => ({
    brokerage_id: brokerageId,
    agent_email: offer.agent_email || user.email,
    agent_name: offer.agent_name || user.full_name,
    property_address: f.property_address.trim(), city: f.city, state: f.state, zip: f.zip, mls_number: f.mls_number,
    list_price: num(f.list_price), offer_price: num(f.offer_price), earnest_money: num(f.earnest_money),
    financing_type: f.financing_type, down_payment_percent: num(f.down_payment_percent),
    loan_amount: num(f.loan_amount) ?? suggestedLoan,
    closing_date: f.closing_date || null,
    offer_expiration: f.offer_expiration ? new Date(f.offer_expiration).toISOString() : null,
    inspection_days: num(f.inspection_days), financing_days: f.financing_type === 'cash' ? null : num(f.financing_days),
    appraisal_contingency: !!f.appraisal_contingency, seller_concessions: num(f.seller_concessions),
    included_items: f.included_items, special_terms: f.special_terms,
    buyers: f.buyers.filter((b) => b.name || b.email), sellers: f.sellers.filter((b) => b.name || b.email),
    listing_agent_name: f.listing_agent_name, listing_agent_email: f.listing_agent_email,
    offer_text: f.offer_text,
    status: offer.status || 'draft',
  });

  const draft = async () => {
    setError(null);
    if (!f.property_address || !f.offer_price) return setError('Add the property address and offer price first.');
    setDrafting(true);
    try {
      const res = await base44.functions.invoke('aiOfferDraft', { ...payload(), offer_expiration: f.offer_expiration || null });
      setF((x) => ({ ...x, offer_text: res.data.offer_text }));
    } catch (err) {
      setError(err.message);
    } finally {
      setDrafting(false);
    }
  };

  const save = async (next) => {
    setError(null);
    if (!f.property_address || !f.offer_price) return setError('Property address and offer price are required.');
    setSaving(true);
    try {
      const data = payload();
      const saved = offer.id ? await base44.entities.Offer.update(offer.id, data) : await base44.entities.Offer.create(data);
      onSaved(saved, next);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[96vw] max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{offer.id ? 'Edit offer' : 'New offer'}</DialogTitle></DialogHeader>
        <div className="grid sm:grid-cols-6 gap-3">
          <div className="sm:col-span-6"><Label>Property address</Label><Input className="mt-1" value={f.property_address} onChange={set('property_address')} placeholder="12 Elm St" /></div>
          <div className="sm:col-span-3"><Label>City</Label><Input className="mt-1" value={f.city} onChange={set('city')} /></div>
          <div><Label>State</Label><Input className="mt-1" value={f.state} onChange={set('state')} maxLength={2} placeholder="CT" /></div>
          <div className="sm:col-span-2"><Label>ZIP</Label><Input className="mt-1" value={f.zip} onChange={set('zip')} /></div>
          <div className="sm:col-span-2">
            <Label>MLS #</Label>
            <div className="mt-1 flex gap-1">
              <Input value={f.mls_number} onChange={set('mls_number')} />
              <Button type="button" variant="outline" size="sm" className="h-10" disabled={!f.mls_number || looking} onClick={lookup} title="Fill from MLS">
                {looking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fill'}
              </Button>
            </div>
          </div>
          <div className="sm:col-span-2"><Label>List price</Label><Input className="mt-1" inputMode="numeric" value={f.list_price} onChange={set('list_price')} /></div>
          <div className="sm:col-span-2"><Label>Offer price</Label><Input className="mt-1" inputMode="numeric" value={f.offer_price} onChange={set('offer_price')} /></div>
          <div className="sm:col-span-2"><Label>Earnest money</Label><Input className="mt-1" inputMode="numeric" value={f.earnest_money} onChange={set('earnest_money')} /></div>
          <div className="sm:col-span-2">
            <Label>Financing</Label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.financing_type} onChange={set('financing_type')}>
              {['conventional', 'FHA', 'VA', 'USDA', 'cash', 'other'].map((t) => <option key={t} value={t}>{t === 'cash' ? 'Cash' : t}</option>)}
            </select>
          </div>
          {f.financing_type !== 'cash' ? (
            <>
              <div className="sm:col-span-2"><Label>Down payment %</Label><Input className="mt-1" inputMode="decimal" value={f.down_payment_percent} onChange={set('down_payment_percent')} /></div>
              <div className="sm:col-span-3"><Label>Loan amount</Label><Input className="mt-1" inputMode="numeric" value={f.loan_amount} onChange={set('loan_amount')} placeholder={suggestedLoan ? String(suggestedLoan) : ''} /></div>
              <div className="sm:col-span-3"><Label>Financing contingency (days)</Label><Input className="mt-1" inputMode="numeric" value={f.financing_days} onChange={set('financing_days')} /></div>
            </>
          ) : <div className="sm:col-span-2" />}
          <div className="sm:col-span-2"><Label>Inspection (days, blank = waived)</Label><Input className="mt-1" inputMode="numeric" value={f.inspection_days} onChange={set('inspection_days')} /></div>
          <div className="sm:col-span-2"><Label>Closing date</Label><Input className="mt-1" type="date" value={f.closing_date || ''} onChange={set('closing_date')} /></div>
          <div className="sm:col-span-2"><Label>Offer expires</Label><Input className="mt-1" type="datetime-local" value={(f.offer_expiration || '').slice(0, 16)} onChange={set('offer_expiration')} /></div>
          <div className="sm:col-span-3"><Label>Seller concessions ($)</Label><Input className="mt-1" inputMode="numeric" value={f.seller_concessions} onChange={set('seller_concessions')} /></div>
          <label className="sm:col-span-3 flex items-center gap-2 text-sm mt-6"><input type="checkbox" checked={!!f.appraisal_contingency} onChange={set('appraisal_contingency')} /> Appraisal contingency</label>
          <div className="sm:col-span-6"><Label>Included items</Label><Input className="mt-1" value={f.included_items} onChange={set('included_items')} placeholder="Refrigerator, washer, dryer" /></div>
          <div className="sm:col-span-6"><Label>Special terms</Label><Textarea className="mt-1" rows={2} value={f.special_terms} onChange={set('special_terms')} /></div>
          <div className="sm:col-span-3"><PartyList label="Buyer(s)" value={f.buyers} onChange={set('buyers')} /></div>
          <div className="sm:col-span-3"><PartyList label="Seller(s)" value={f.sellers} onChange={set('sellers')} /></div>
          <div className="sm:col-span-3"><Label>Listing agent</Label><Input className="mt-1" value={f.listing_agent_name} onChange={set('listing_agent_name')} /></div>
          <div className="sm:col-span-3"><Label>Listing agent email</Label><Input className="mt-1" type="email" value={f.listing_agent_email} onChange={set('listing_agent_email')} /></div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <Label>Offer letter</Label>
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={draft} disabled={drafting}>
              {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {f.offer_text ? 'Rewrite with AI' : 'Write with AI'}
            </Button>
          </div>
          <Textarea rows={14} value={f.offer_text} onChange={set('offer_text')} placeholder="AI writes the offer from the terms above. You can edit anything before sending." className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">Review every term before sending. The offer is drafted from what you entered and doesn't replace your state's standard forms.</p>
        </div>

        {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={() => save()} disabled={saving}>Save draft</Button>
          <Button onClick={() => save('send')} disabled={saving || !f.offer_text} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Save & send to sign
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SendOffer({ offer, user, brokerageId, onClose, onSent }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const file = textToPdfFile(offer.offer_text, `Offer - ${offer.property_address}.pdf`);
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.Offer.update(offer.id, { document_url: file_url });
        setUrl(file_url);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [offer]);

  const signers = [
    ...(offer.buyers || []).filter((b) => b.email).map((b) => ({ name: b.name, email: b.email, role: 'Buyer' })),
    { name: user.full_name, email: user.email, role: "Buyer's agent" },
  ].map((s, i) => ({ id: `s${i}`, ...s }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[96vw] max-w-6xl max-h-[94vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Send offer for signature</DialogTitle></DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : !url ? (
          <div className="py-16 flex justify-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Preparing the PDF…</div>
        ) : (
          <UnifiedESignCreator
            user={user}
            brokerageId={brokerageId}
            initialTitle={`Offer - ${offer.property_address}`}
            initialDocumentUrl={url}
            initialSigners={signers}
            onCancel={onClose}
            onComplete={async (result) => {
              if (!result) return onClose();
              await base44.entities.Offer.update(offer.id, {
                status: 'sent',
                esign_document_id: result.document?.id,
                submission_id: result.submissionId,
              });
              onSent();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AcceptOffer({ offer, brokerageId, onClose, onDone }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [price, setPrice] = useState(offer.offer_price ?? '');
  const [tc, setTc] = useState('');
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    base44.entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 500).then(setUsers).catch(() => {});
    base44.entities.BrokerageSettings.filter({ brokerage_id: brokerageId }).then((r) => setTc(r[0]?.default_tc_email || '')).catch(() => {});
  }, [brokerageId]);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('offerAccepted', { offerId: offer.id, acceptanceDate: date, finalPrice: num(price), tcEmail: tc || undefined });
      onDone(res.data.transaction_id);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Offer accepted 🎉</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">This opens the transaction for {offer.property_address}, sets the contract deadlines, starts the checklist and notifies the transaction coordinator.</p>
        <div className="space-y-3 mt-2">
          <div><Label>Acceptance date</Label><Input type="date" className="mt-1" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Final price (if countered)</Label><Input className="mt-1" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div>
            <Label>Transaction coordinator</Label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={tc} onChange={(e) => setTc(e.target.value)}>
              <option value="">Automatic: TC with the fewest open files</option>
              {users.map((u) => <option key={u.id} value={u.email}>{u.display_name || u.full_name || u.email}</option>)}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={go} disabled={busy} className="gap-1.5 bg-green-600 hover:bg-green-700">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} Open transaction
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmailListingAgent({ offer, onClose, onSent }) {
  const [to, setTo] = useState(offer.listing_agent_email || '');
  const [cc, setCc] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const signedLabel = offer.submission_id ? 'The signed copy is attached once your buyers have signed; until then, the offer PDF.' : 'The offer PDF is attached.';

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await base44.functions.invoke('offerSend', {
        offerId: offer.id, to, message: message.trim() || undefined,
        cc: cc.split(/[,;\s]+/).filter(Boolean),
      });
      if (!offer.listing_agent_email && to) await base44.entities.Offer.update(offer.id, { listing_agent_email: to });
      onSent();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Send offer to listing agent</DialogTitle></DialogHeader>
        {offer.review_status === 'requested' && (
          <p className="text-xs rounded-md bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">A broker review is still pending on this offer.</p>
        )}
        <div className="space-y-3">
          <div><Label>To (listing agent)</Label><Input className="mt-1" type="email" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label>Also copy (optional)</Label><Input className="mt-1" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="lender@..., co-agent@..." /></div>
          <div>
            <Label>Message (optional)</Label>
            <Textarea className="mt-1" rows={5} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Leave blank for a short standard cover note with the key terms." />
          </div>
          <p className="text-xs text-muted-foreground">{signedLabel} It's sent in your name, you're copied, and replies come straight to you.</p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={busy || !to} className="gap-1.5">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
