import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Sparkles, FileText, ClipboardList, Upload, CheckCircle2, RefreshCw, ArrowRight, AlertCircle, Send, Library, TrendingUp } from 'lucide-react';
import { pdfPageTexts } from '@/lib/pdfText';
import { collectFacts, offerFromAnswers } from '../../../shared/contractIntake.js';
import { isPrefilled, fieldSignerIndex } from '../../../shared/esignGeometry.js';
import ESignFieldEditor, { fillFromDeal } from '@/components/esign/ESignFieldEditor';
import { autoDetectFields } from '@/components/esign/autoDetectFields';
import { isAdminRole } from '../../../shared/permissions.generated.js';
import { useContractForms, typeLabel } from './FormsLibrary';
import { ROLE_PRESETS } from '@/components/repository/FormFieldsDialog';
import CoachResult from '@/components/offers/CoachResult';

const sel = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STEPS = [['doc', 'Document'], ['intake', 'Questions'], ['review', 'Review'], ['send', 'Send']];

/**
 * One flow for contracts and offers:
 *   1. the document: a form from the brokerage's library, or upload one,
 *   2. optionally a deal (or offer) to pre-fill from, then the questions the AI wrote for that document,
 *   3. AI fills every blank it can; review and edit,
 *   4. send for signature.
 * offerMode: also creates (or updates) the Offer so it shows in Offers with its status.
 */
export default function ContractWizard({ user, brokerageId, brokerageName, onClose, form: presetForm = null, offerMode = false, initialOffer = null, initialDealId = null, initialDoc = null }) {
  const admin = isAdminRole(user?.role) || user?.role === 'super_admin';
  const [form, setForm] = useState(presetForm);
  const [step, setStep] = useState(initialDoc ? 'review' : presetForm ? 'source' : 'doc');
  const [source, setSource] = useState(initialOffer ? { kind: 'offer', id: initialOffer.id, record: initialOffer } : initialDealId ? { kind: 'deal', id: initialDealId } : { kind: 'none' });
  const [intake, setIntake] = useState(null);
  const [answers, setAnswers] = useState(initialOffer?.intake_answers || {});
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [draft, setDraft] = useState(initialDoc);
  const [fields, setFields] = useState(initialDoc?.fields || []);
  const [offer, setOffer] = useState(initialOffer);
  const [busy, setBusy] = useState(false);
  const [coach, setCoach] = useState(null); // AI pricing coach: null | 'loading' | result

  const { data: deals = [] } = useQuery({ queryKey: ['wiz-deals', user?.email], queryFn: () => base44.entities.Transaction.filter({}, '-updated_date', 200).catch(() => []), enabled: ['doc', 'source'].includes(step) });
  const { data: offers = [] } = useQuery({ queryKey: ['wiz-offers', user?.email], queryFn: () => base44.entities.Offer.filter(admin ? {} : { agent_email: user.email }, '-created_date', 100).catch(() => []), enabled: !offerMode && ['doc', 'source'].includes(step) });

  const dealRec = source.kind === 'deal' ? source.record || deals.find((d) => d.id === source.id) || null : null;
  const offerRec = source.kind === 'offer' ? source.record || offers.find((o) => o.id === source.id) || null : null;
  const facts = useMemo(() => collectFacts({ deal: dealRec, offer: offerRec, agent: user, brokerageName }), [dealRec, offerRec, user, brokerageName]);

  // Read the document and get (or make) its questions.
  const readForm = async (f = form, force = false) => {
    setError(''); setStep('reading');
    try {
      if (source.kind === 'deal' && source.id && !dealRec) {
        const rec = await base44.entities.Transaction.get(source.id).catch(() => null);
        if (rec) setSource((s) => ({ ...s, record: rec }));
      }
      let data = !force && f.intake?.questions?.length ? f.intake : null;
      if (!data) {
        setProgress('Reading the document…');
        const pages = await pdfPageTexts(f.document_url, { onProgress: (n, total) => setProgress(`Reading page ${n} of ${total}…`) });
        setProgress('Writing the questions this document needs…');
        const text = pages.map((p) => `--- Page ${p.n} ---\n${p.text}`).join('\n');
        data = (await base44.functions.invoke('contractIntake', f.id ? { form_id: f.id, text, force } : { name: f.name, text })).data;
      }
      setIntake(data);
      setStep('intake');
    } catch (e) {
      setError(e?.data?.error || e.message || 'Could not read the document.');
      setStep(presetForm ? 'source' : 'doc');
    }
  };

  // Pre-fill answers from what the app knows (keeps anything already typed).
  useEffect(() => {
    if (!intake) return;
    setAnswers((cur) => {
      const next = { ...cur };
      for (const q of intake.questions) if ((next[q.key] == null || next[q.key] === '') && q.source !== 'none' && facts[q.source]) next[q.key] = facts[q.source];
      return next;
    });
  }, [intake, facts]);

  const groups = useMemo(() => {
    const g = new Map();
    for (const q of intake?.questions || []) { if (!g.has(q.group)) g.set(q.group, []); g.get(q.group).push(q); }
    return [...g];
  }, [intake]);
  const answered = (intake?.questions || []).filter((q) => String(answers[q.key] ?? '').trim()).length;
  const known = useMemo(() => ({ ...facts, ...collectFacts({ offer: offerFromAnswers(intake?.questions, answers) }) }), [facts, intake, answers]);

  // Pricing coach (offers): recent sales near the address -> suggested price and terms.
  const priceQ = (intake?.questions || []).find((q) => q.source === 'purchase_price');
  const runCoach = async () => {
    setCoach('loading'); setError('');
    try {
      const terms = offerFromAnswers(intake?.questions, answers);
      const res = await base44.functions.invoke('aiOfferStrategy', {
        ...terms, property_address: terms.property_address || known.property_address, city: terms.city || known.city, state: terms.state || known.state, zip: terms.zip || known.zip,
        mls_number: terms.mls_number || known.mls_number, list_price: terms.list_price, offer_price: terms.offer_price, notes: '',
      });
      setCoach(res.data);
    } catch (e) { setCoach(null); setError(e?.data?.error || e.message); }
  };

  const fill = async () => {
    setError(''); setStep('filling');
    try {
      const roles = (form.roles || []).length ? form.roles : ROLE_PRESETS[form.form_type] || ['Buyer 1', 'Buyer 2', 'Seller 1', 'Seller 2'];
      const split = (v) => String(v || '').split(/\s*(?:,|;|\band\b|&)\s*/i).map((x) => x.trim()).filter(Boolean);
      const buyerNames = split(known.buyers); const sellerNames = split(known.sellers);
      let b = 0; let s = 0;
      const signers = roles.map((r, k) => {
        const agentRole = /agent|licensee|broker/i.test(r);
        return {
          id: `role-${k}-${Date.now()}`, role: r, role_index: k,
          name: /buyer|purchaser|tenant/i.test(r) ? buyerNames[b++] || '' : /seller|owner|landlord/i.test(r) ? sellerNames[s++] || '' : agentRole ? known.agent_name || '' : '',
          email: agentRole ? known.agent_email || '' : '',
        };
      });
      const title = `${form.name}${known.property_address ? ` - ${known.property_address}` : ''}`;
      const doc = await base44.entities.ESignDocument.create({
        brokerage_id: brokerageId, title,
        ...(dealRec?.id ? { transaction_id: dealRec.id } : {}),
        document_url: form.document_url,
        // Boxes set up on the form and tied to deal facts fill themselves in.
        fields: fillFromDeal(form.fields || [], { ...(dealRec || {}), ...(offerRec || {}), brokerage_name: brokerageName, agent_name: known.agent_name, agent_email: known.agent_email }),
        signers, created_by_email: user.email, created_by_name: user.full_name,
        contract_form_id: form.id || null, intake_answers: answers,
      });
      if (offerMode) {
        const patch = {
          ...offerFromAnswers(intake?.questions, answers),
          esign_document_id: doc.id, contract_form_id: form.id || null, contract_name: form.name, intake_answers: answers,
          ...(dealRec?.id ? { transaction_id: dealRec.id } : {}),
        };
        if (!patch.property_address) patch.property_address = known.property_address || form.name;
        setOffer(offer?.id
          ? await base44.entities.Offer.update(offer.id, patch)
          : await base44.entities.Offer.create({ brokerage_id: brokerageId, agent_email: user.email, agent_name: user.full_name, status: 'draft', ...patch }));
      }
      setDraft(doc); setFields(doc.fields || []);
      setStep('review');
    } catch (e) {
      setError(e.message || 'Could not start the contract.');
      setStep('intake');
    }
  };

  const aiFacts = useMemo(() => ({
    ...known,
    offer_price: known.purchase_price,
    buyers: known.buyers ? [known.buyers] : [],
    sellers: known.sellers ? [known.sellers] : [],
    intake: (intake?.questions || []).map((q) => ({ label: q.label, value: answers[q.key] ?? '' })).filter((a) => String(a.value).trim()),
  }), [known, intake, answers]);

  const filled = fields.filter((f) => f.sender_fill && String(f.value || '').trim()).length;
  const blanks = fields.filter((f) => f.sender_fill).length;
  const stepIdx = { doc: 0, source: 0, reading: 1, intake: 1, filling: 2, review: 2, send: 3, sent: 3 }[step];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={`w-[96vw] ${step === 'review' ? 'max-w-7xl' : 'max-w-3xl'} max-h-[94dvh]`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6"><Sparkles className="w-5 h-5 text-violet-600" /> {offerMode ? (offer?.id ? 'Offer' : 'New offer') : 'Fill with AI'}{form ? `: ${form.name}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-1.5 text-xs -mt-1 mb-1 overflow-x-auto">
          {STEPS.map(([k, l], i) => (
            <React.Fragment key={k}>
              {i > 0 && <span className="w-4 h-px bg-border flex-shrink-0" />}
              <span className={`flex items-center gap-1 whitespace-nowrap ${i === stepIdx ? 'text-foreground font-semibold' : i < stepIdx ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i < stepIdx ? 'bg-emerald-600 text-white' : i === stepIdx ? 'bg-violet-600 text-white' : 'bg-muted'}`}>{i < stepIdx ? '✓' : i + 1}</span>{l}
              </span>
            </React.Fragment>
          ))}
        </div>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-3 flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}</p>}

        {step === 'doc' && <PickDocument user={user} brokerageId={brokerageId} admin={admin} deals={deals} source={source} setSource={setSource} offerMode={offerMode}
          onPick={(f) => { setForm(f); readForm(f); }} onCancel={onClose} setError={setError} />}

        {step === 'source' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">What are you filling this out for? Its details pre-fill the questions. You can also start blank.</p>
            <SourcePicker source={source} setSource={setSource} deals={deals} offers={offers} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button className="gap-1.5" disabled={source.kind !== 'none' && !source.id} onClick={() => readForm()}>Next <ArrowRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}

        {(step === 'reading' || step === 'filling') && (
          <div className="py-16 flex flex-col items-center gap-3 text-sm text-muted-foreground text-center">
            <Loader2 className="w-7 h-7 animate-spin text-violet-600" />
            {step === 'reading' ? (progress || 'Getting the document ready…') : 'Setting up the contract…'}
            {step === 'reading' && !form?.intake && <p className="text-xs max-w-sm">The AI is reading the document and writing the questions it needs. Library forms only do this once.</p>}
          </div>
        )}

        {step === 'intake' && intake && (
          <div className="flex flex-col min-h-0 max-h-[72dvh]">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b">
              <p className="text-sm text-muted-foreground">{intake.form_summary} Answer what you know; leave the rest blank.</p>
              <span className="text-xs rounded-full bg-muted px-2.5 py-1">{answered} of {intake.questions.length} answered</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-6 pr-1">
              {offerMode && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm"><TrendingUp className="w-4 h-4 inline text-violet-700 -mt-0.5" /> <span className="font-medium">Not sure what to offer?</span> <span className="text-muted-foreground">The AI looks at recent sales near the address and suggests a price and terms.</span></p>
                    <Button size="sm" variant="outline" className="gap-1.5" disabled={coach === 'loading' || !(known.property_address || known.mls_number)} onClick={runCoach}>
                      {coach === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {coach && coach !== 'loading' ? 'Ask again' : 'Price it with AI'}
                    </Button>
                  </div>
                  {coach && coach !== 'loading' && <CoachResult data={coach} onUsePrice={(p) => priceQ && setAnswers((a) => ({ ...a, [priceQ.key]: `$${Number(p).toLocaleString('en-US')}` }))} />}
                  {!(known.property_address || known.mls_number) && <p className="text-xs text-muted-foreground">Fill in the property address below first.</p>}
                </div>
              )}
              {groups.map(([g, qs]) => (
                <div key={g}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{g}</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {qs.map((q) => <Question key={q.key} q={q} value={answers[q.key] ?? ''} prefilled={q.source !== 'none' && facts[q.source] && answers[q.key] === facts[q.source]}
                      onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} />)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t">
              {admin && form?.id ? <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={() => readForm(form, true)}><RefreshCw className="w-3 h-3" /> Rewrite the questions</button> : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button className="gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={fill}><Sparkles className="w-4 h-4" /> Fill the contract</Button>
              </div>
            </div>
          </div>
        )}

        {step === 'review' && draft && (
          <div className="flex flex-col min-h-0 max-h-[78dvh]">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <p className="text-sm">
                {blanks ? <><CheckCircle2 className="w-4 h-4 inline text-emerald-600 -mt-0.5" /> AI filled <strong>{filled}</strong> of <strong>{blanks}</strong> blanks. Double-click any box to type or change it.</> : initialDoc ? 'Review the contract. Double-click any box to change it.' : 'Reading the contract and filling the blanks…'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Save and close</Button>
                <Button className="gap-1.5" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try { const saved = await base44.entities.ESignDocument.update(draft.id, { fields }); setDraft(saved); setStep('send'); } catch (e) { setError(e.message); } finally { setBusy(false); }
                }}><Send className="w-4 h-4" /> Next: send for signature</Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ESignFieldEditor doc={draft} deal={initialDoc ? null : aiFacts} autoRun={!initialDoc} onAutoDetect={autoDetectFields} onChange={setFields} onComplete={() => setStep('send')} />
            </div>
          </div>
        )}

        {step === 'send' && draft && <SendStep draft={draft} fields={fields} offer={offer} dealId={draft.transaction_id} onBack={() => setStep('review')}
          onSent={async (submissionId) => {
            if (offer?.id) await base44.entities.Offer.update(offer.id, { status: 'sent', submission_id: submissionId, esign_document_id: draft.id }).catch(() => {});
            setStep('sent');
          }} />}

        {step === 'sent' && (
          <div className="py-12 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
            <p className="text-lg font-semibold">Sent for signature</p>
            <p className="text-sm text-muted-foreground">Everyone gets an email with their signing link. Track it in E-Sign Documents{offer ? ' and here in Offers' : ''}.</p>
            <Button onClick={onClose}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PickDocument({ user, brokerageId, admin, deals, source, setSource, offerMode, onPick, onCancel, setError }) {
  const { data: forms = [], isLoading } = useContractForms(brokerageId);
  const [mode, setMode] = useState('library');
  const [file, setFile] = useState(null);
  const [save, setSave] = useState(admin);
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(() => [...forms].sort((a, b) => (b.form_type === 'purchase_agreement') - (a.form_type === 'purchase_agreement') || String(a.name).localeCompare(String(b.name))), [forms]);

  const useUpload = async () => {
    setBusy(true); setError('');
    try {
      if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error('Upload the document as a PDF.');
      const name = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
      if (save && admin) {
        const document_url = (await base44.integrations.Core.UploadFile({ file, scope: { kind: 'forms' } })).file_url;
        onPick(await base44.entities.ContractForm.create({ brokerage_id: brokerageId, name, form_type: offerMode ? 'purchase_agreement' : 'other', document_url, is_active: true, fields: [], roles: ROLE_PRESETS.purchase_agreement, created_by_email: user.email }));
      } else {
        const document_url = (await base44.integrations.Core.UploadFile({ file, scope: { kind: 'user', id: user.id } })).file_url;
        onPick({ id: null, name, document_url, form_type: offerMode ? 'purchase_agreement' : 'other', fields: [], roles: ROLE_PRESETS.purchase_agreement });
      }
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-1.5">{offerMode ? 'Start from a deal (optional)' : 'Fill it out for'}</p>
        <SourcePicker source={source} setSource={setSource} deals={deals} offers={[]} compact />
      </div>
      <div>
        <p className="text-sm font-medium mb-1.5">Which document?</p>
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-sm mb-3">
          {[['library', 'From your forms', Library], ['upload', 'Upload a document', Upload]].map(([k, l, Icon]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 ${mode === k ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}><Icon className="w-4 h-4" /> {l}</button>
          ))}
        </div>
        {mode === 'library' ? (
          isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : !sorted.length ? (
            <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-4">No forms in your library yet. Use "Upload a document" instead{admin ? ', and tick "Save to the library" so it\'s here next time' : ''}.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-2 max-h-[40dvh] overflow-y-auto">
              {sorted.map((f) => (
                <button key={f.id} type="button" disabled={source.kind !== 'none' && !source.id} onClick={() => onPick(f)}
                  className="text-left rounded-xl border p-3 hover:border-violet-500 hover:bg-violet-50/40 flex items-center gap-3 disabled:opacity-50">
                  <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{f.name}</span>
                    <span className="block text-xs text-muted-foreground">{typeLabel(f.form_type)}{f.state ? ` · ${f.state}` : ''}{f.intake?.questions?.length ? ' · AI ready' : ''}</span>
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-5 text-sm cursor-pointer hover:border-primary">
              <Upload className="w-4 h-4" /> {file ? file.name : 'Choose a PDF (purchase agreement, addendum, any form)'}
              <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            {admin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save to the brokerage's forms library (the AI's questions are kept for next time)</label>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onCancel}>Cancel</Button>
              <Button className="gap-1.5 bg-violet-600 hover:bg-violet-700" disabled={!file || busy || (source.kind !== 'none' && !source.id)} onClick={useUpload}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Fill with AI
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SourcePicker({ source, setSource, deals, offers, compact }) {
  const kinds = [['none', compact ? 'No deal' : 'Start blank', FileText], ['deal', 'A deal', ClipboardList], ...(offers.length ? [['offer', 'An offer', FileText]] : [])];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {kinds.map(([k, l, Icon]) => (
          <button key={k} type="button" onClick={() => setSource({ kind: k, id: '' })}
            className={`rounded-lg border px-3 py-1.5 text-sm flex items-center gap-1.5 ${source.kind === k ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'hover:border-primary/50'}`}>
            <Icon className="w-4 h-4 text-primary" /> {l}
          </button>
        ))}
      </div>
      {source.kind === 'deal' && (
        <select className={sel} value={source.id} onChange={(e) => setSource({ kind: 'deal', id: e.target.value })}>
          <option value="">Choose a deal…</option>
          {deals.map((d) => <option key={d.id} value={d.id}>{d.property_address}{d.status ? ` · ${String(d.status).replace(/_/g, ' ')}` : ''}</option>)}
        </select>
      )}
      {source.kind === 'offer' && (
        <select className={sel} value={source.id} onChange={(e) => setSource({ kind: 'offer', id: e.target.value })}>
          <option value="">Choose an offer…</option>
          {offers.map((o) => <option key={o.id} value={o.id}>{o.property_address}{o.offer_price ? ` · $${Number(o.offer_price).toLocaleString()}` : ''}</option>)}
        </select>
      )}
    </div>
  );
}

// Who signs: one row per signer the contract has boxes for. Rows nobody signs are left out.
function SendStep({ draft, fields, dealId, onBack, onSent }) {
  const used = useMemo(() => new Set(fields.filter((f) => !isPrefilled(f)).map(fieldSignerIndex)), [fields]);
  const [rows, setRows] = useState(() => (draft.signers || []).map((s, i) => ({ ...s, i, include: used.has(i) })));
  const [order, setOrder] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kept = rows.filter((r) => r.include);
  const missing = kept.filter((r) => !EMAIL.test(String(r.email || '').trim()));
  const set = (i, patch) => setRows((rs) => rs.map((r) => (r.i === i ? { ...r, ...patch } : r)));

  const send = async () => {
    setBusy(true); setError('');
    try {
      // Renumber signers to the ones kept, and point every box at its signer's new number.
      const map = new Map(kept.map((r, n) => [r.i, n]));
      const signers = kept.map((r) => ({ id: r.id, name: String(r.name || '').trim(), email: String(r.email).trim().toLowerCase(), role: r.role }));
      const nextFields = fields
        .filter((f) => isPrefilled(f) || map.has(fieldSignerIndex(f)))
        .map((f) => ({ ...f, signer_index: map.has(fieldSignerIndex(f)) ? map.get(fieldSignerIndex(f)) : 0 }));
      await base44.entities.ESignDocument.update(draft.id, { fields: nextFields, signers });
      const res = await base44.functions.invoke('createESignSubmission', {
        documentId: draft.id, documentTitle: draft.title, signers, sequenceType: order ? 'sequential' : 'all_at_once',
        ...(dealId ? { transactionId: dealId } : {}), ...(message.trim() ? { message: message.trim() } : {}),
      });
      await onSent(res.data?.submission_id);
    } catch (e) { setError(e?.data?.error || e.message || 'Could not send.'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Add an email for each person signing. Untick anyone who isn't signing this time; their boxes are left off.</p>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.i} className={`rounded-xl border p-3 grid sm:grid-cols-[auto_140px_1fr_1fr] gap-2 items-center ${r.include ? '' : 'opacity-50'}`}>
            <input type="checkbox" checked={r.include} onChange={(e) => set(r.i, { include: e.target.checked })} aria-label={`Include ${r.role}`} />
            <span className="text-sm font-medium">{r.role || `Signer ${r.i + 1}`}{!used.has(r.i) && <span className="block text-[11px] text-muted-foreground font-normal">no boxes yet</span>}</span>
            <Input value={r.name || ''} onChange={(e) => set(r.i, { name: e.target.value })} placeholder="Full name" disabled={!r.include} />
            <Input type="email" value={r.email || ''} onChange={(e) => set(r.i, { email: e.target.value })} placeholder="Email" disabled={!r.include}
              className={r.include && r.email && !EMAIL.test(r.email.trim()) ? 'border-amber-400' : ''} />
          </div>
        ))}
      </div>
      <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message to signers (optional)" className={`${sel} resize-y`} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={order} onChange={(e) => setOrder(e.target.checked)} /> Sign in this order (each person gets it after the one before signs)</label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={onBack}>Back to the contract</Button>
        <Button className="gap-1.5" disabled={busy || !kept.length || missing.length > 0} onClick={send}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send to {kept.length} signer{kept.length === 1 ? '' : 's'}
        </Button>
      </div>
      {missing.length > 0 && <p className="text-xs text-amber-700 text-right">Needs an email: {missing.map((m) => m.role).join(', ')}</p>}
    </div>
  );
}

function Question({ q, value, onChange, prefilled }) {
  const common = { value, onChange: (e) => onChange(e.target.value), className: 'mt-1' };
  let input;
  if (q.type === 'textarea') input = <textarea rows={3} {...common} className={`${sel} mt-1 resize-y`} />;
  else if (q.type === 'yesno') input = (
    <div className="mt-1 flex gap-1.5">{['Yes', 'No'].map((o) => <button key={o} type="button" onClick={() => onChange(value === o ? '' : o)} className={`px-3 py-1.5 rounded-md border text-sm ${value === o ? 'bg-primary text-primary-foreground border-primary' : 'hover:border-primary/50'}`}>{o}</button>)}</div>
  );
  else if (q.type === 'choice' && q.options?.length) input = (
    <select {...common} className={`${sel} mt-1`}><option value="">Choose…</option>{q.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>
  );
  else input = <Input {...common} inputMode={q.type === 'money' || q.type === 'number' ? 'decimal' : undefined}
    placeholder={q.type === 'money' ? '$' : q.type === 'date' ? 'MM/DD/YYYY' : q.type === 'names' ? 'Full names, separated by commas' : ''} />;
  return (
    <label className={`block text-sm ${q.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
      <span className="font-medium">{q.label}</span>
      {prefilled && <span className="ml-1.5 text-[10px] rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5">from the deal</span>}
      {input}
      {q.help && <span className="block text-xs text-muted-foreground mt-0.5">{q.help}</span>}
    </label>
  );
}
