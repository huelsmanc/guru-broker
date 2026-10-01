import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Sparkles, FileText, ClipboardList, Handshake, CheckCircle2, RefreshCw, ArrowRight, AlertCircle } from 'lucide-react';
import { pdfPageTexts } from '@/lib/pdfText';
import { collectFacts } from '../../../shared/contractIntake.js';
import ESignFieldEditor, { fillFromDeal } from '@/components/esign/ESignFieldEditor';
import { autoDetectFields } from '@/components/esign/autoDetectFields';
import { isAdminRole } from '../../../shared/permissions.generated.js';

const sel = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

/**
 * Fill a contract form with AI:
 *   1. pick what you're filling it for (a deal, an offer, or nothing),
 *   2. answer the form's own intake questions (written by AI from the form, pre-filled from the deal),
 *   3. AI fills every blank it can; review and edit the filled contract.
 * The result is saved as an e-sign draft, ready to send for signature later.
 */
export default function FillWithAI({ form, user, brokerageId, brokerageName, onClose, initialOffer = null, initialDealId = null }) {
  const navigate = useNavigate();
  const admin = isAdminRole(user?.role) || user?.role === 'super_admin';
  const [step, setStep] = useState(initialOffer || initialDealId ? 'reading' : 'source');
  const [source, setSource] = useState(initialOffer ? { kind: 'offer', id: initialOffer.id } : initialDealId ? { kind: 'deal', id: initialDealId } : { kind: 'none' });
  const [intake, setIntake] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [draft, setDraft] = useState(null);
  const [fields, setFields] = useState([]);

  const { data: deals = [] } = useQuery({
    queryKey: ['fill-deals', user?.email],
    queryFn: () => base44.entities.Transaction.filter({}, '-updated_date', 200).catch(() => []),
    enabled: step === 'source',
  });
  const { data: offers = [] } = useQuery({
    queryKey: ['fill-offers', user?.email],
    queryFn: () => base44.entities.Offer.filter(admin ? {} : { agent_email: user.email }, '-created_date', 100).catch(() => []),
    enabled: step === 'source',
  });

  const facts = useMemo(() => {
    const deal = source.kind === 'deal' ? deals.find((d) => d.id === source.id) || source.record : null;
    const offer = source.kind === 'offer' ? (initialOffer?.id === source.id ? initialOffer : offers.find((o) => o.id === source.id)) || source.record : null;
    return collectFacts({ deal, offer, agent: user, brokerageName });
  }, [source, deals, offers, initialOffer, user, brokerageName]);

  // Read the form and get (or make) its questions.
  const readForm = async (force = false) => {
    setError(''); setStep('reading');
    try {
      let rec = source.kind === 'deal' && !deals.find((d) => d.id === source.id) ? await base44.entities.Transaction.get(source.id).catch(() => null) : null;
      if (rec) setSource((s) => ({ ...s, record: rec }));
      let data = !force && form.intake?.questions?.length ? form.intake : null;
      if (!data) {
        setProgress('Reading the form…');
        const pages = await pdfPageTexts(form.document_url, { onProgress: (n, total) => setProgress(`Reading page ${n} of ${total}…`) });
        setProgress('Writing the questions this form needs…');
        data = (await base44.functions.invoke('contractIntake', { form_id: form.id, text: pages.map((p) => `--- Page ${p.n} ---\n${p.text}`).join('\n'), force })).data;
      }
      setIntake(data);
      setStep('intake');
    } catch (e) {
      setError(e?.data?.error || e.message || 'Could not read the form.');
      setStep('source');
    }
  };
  useEffect(() => { if (step === 'reading' && !intake) readForm(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill answers from what the app knows (keeps anything already typed).
  useEffect(() => {
    if (!intake) return;
    setAnswers((cur) => {
      const next = { ...cur };
      for (const q of intake.questions) if (next[q.key] == null && q.source !== 'none' && facts[q.source]) next[q.key] = facts[q.source];
      return next;
    });
  }, [intake, facts]);

  const groups = useMemo(() => {
    const g = new Map();
    for (const q of intake?.questions || []) { if (!g.has(q.group)) g.set(q.group, []); g.get(q.group).push(q); }
    return [...g];
  }, [intake]);
  const answered = (intake?.questions || []).filter((q) => String(answers[q.key] ?? '').trim()).length;

  const offerRecord = () => (source.kind === 'offer' ? (initialOffer?.id === source.id ? initialOffer : offers.find((o) => o.id === source.id)) : null);

  const fill = async () => {
    setError(''); setStep('filling');
    try {
      const deal = source.kind === 'deal' ? source.record || deals.find((d) => d.id === source.id) : null;
      const roles = (form.roles || []).length ? form.roles : ['Buyer 1', 'Buyer 2', 'Seller 1', 'Seller 2'];
      const buyerNames = String(facts.buyers || '').split(/,| and /).map((x) => x.trim()).filter(Boolean);
      const sellerNames = String(facts.sellers || '').split(/,| and /).map((x) => x.trim()).filter(Boolean);
      let b = 0; let s = 0;
      const signers = roles.map((r, k) => ({
        id: `role-${k}-${Date.now()}`, role: r, role_index: k, email: '',
        name: /buyer|purchaser/i.test(r) ? buyerNames[b++] || '' : /seller|owner/i.test(r) ? sellerNames[s++] || '' : /agent|licensee|broker/i.test(r) ? facts.agent_name || '' : '',
      }));
      const doc = await base44.entities.ESignDocument.create({
        brokerage_id: brokerageId,
        title: `${form.name}${facts.property_address ? ` - ${facts.property_address}` : ''}`,
        ...(deal?.id ? { transaction_id: deal.id } : {}),
        document_url: form.document_url,
        // Boxes set up on the form and tied to deal facts fill themselves in.
        fields: fillFromDeal(form.fields || [], { ...(deal || {}), ...(offerRecord() || {}), brokerage_name: brokerageName, agent_name: facts.agent_name, agent_email: facts.agent_email }),
        signers,
        created_by_email: user.email,
        created_by_name: user.full_name,
        contract_form_id: form.id,
        intake_answers: answers,
      });
      setDraft(doc);
      setStep('review');
    } catch (e) {
      setError(e.message || 'Could not start the contract.');
      setStep('intake');
    }
  };

  const aiFacts = useMemo(() => ({
    ...facts,
    offer_price: facts.purchase_price,
    // The filler expects lists of people.
    buyers: facts.buyers ? [facts.buyers] : [],
    sellers: facts.sellers ? [facts.sellers] : [],
    intake: (intake?.questions || []).map((q) => ({ label: q.label, value: answers[q.key] ?? '' })).filter((a) => String(a.value).trim()),
  }), [facts, intake, answers]);

  const filled = fields.filter((f) => f.sender_fill && String(f.value || '').trim()).length;
  const blanks = fields.filter((f) => f.sender_fill).length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={`w-[96vw] ${step === 'review' ? 'max-w-7xl' : 'max-w-3xl'} max-h-[94dvh]`}>
        <DialogHeader><DialogTitle className="flex items-center gap-2 pr-6"><Sparkles className="w-5 h-5 text-violet-600" /> Fill with AI: {form.name}</DialogTitle></DialogHeader>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm p-3 flex gap-2"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{error}</p>}

        {step === 'source' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">What are you filling this out for? Its details fill in the questions for you. You can also start blank.</p>
            <div className="grid sm:grid-cols-3 gap-2">
              {[['deal', 'A deal', ClipboardList], ['offer', 'An offer', Handshake], ['none', 'Start blank', FileText]].map(([k, l, Icon]) => (
                <button key={k} type="button" onClick={() => setSource({ kind: k, id: '' })}
                  className={`rounded-xl border p-3 text-left ${source.kind === k ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'hover:border-primary/50'}`}>
                  <Icon className="w-5 h-5 text-primary" /><p className="text-sm font-medium mt-1">{l}</p>
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
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button className="gap-1.5" disabled={source.kind !== 'none' && !source.id} onClick={() => readForm()}>Next <ArrowRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}

        {(step === 'reading' || step === 'filling') && (
          <div className="py-16 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="w-7 h-7 animate-spin text-violet-600" />
            {step === 'reading' ? (progress || 'Getting the form ready…') : 'Setting up the contract…'}
            {step === 'reading' && !form.intake && <p className="text-xs">The first time takes a little longer: the AI reads the form and writes its questions. After that it's instant.</p>}
          </div>
        )}

        {step === 'intake' && intake && (
          <div className="flex flex-col min-h-0 max-h-[78dvh]">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b">
              <p className="text-sm text-muted-foreground">{intake.form_summary} Answer what you know; leave the rest blank.</p>
              <span className="text-xs rounded-full bg-muted px-2.5 py-1">{answered} of {intake.questions.length} answered</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-6 pr-1">
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
              {admin ? <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" onClick={() => readForm(true)}><RefreshCw className="w-3 h-3" /> Rewrite the questions</button> : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button className="gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={fill}><Sparkles className="w-4 h-4" /> Fill the contract</Button>
              </div>
            </div>
          </div>
        )}

        {step === 'review' && draft && (
          <div className="flex flex-col min-h-0 max-h-[82dvh]">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <p className="text-sm">
                {blanks ? <><CheckCircle2 className="w-4 h-4 inline text-emerald-600 -mt-0.5" /> AI filled <strong>{filled}</strong> of <strong>{blanks}</strong> blanks. Empty boxes still need you: double-click any box to type or change it.</> : 'Reading the contract and filling the blanks…'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { onClose(); navigate('/ESignDocuments'); }} className="gap-1.5">Open in E-Sign</Button>
                <Button onClick={onClose}>Done</Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ESignFieldEditor doc={draft} deal={aiFacts} autoRun onAutoDetect={autoDetectFields} onChange={setFields}
                onComplete={() => onClose()} />
            </div>
            <p className="text-xs text-muted-foreground pt-2">Saved automatically as a draft in E-Sign Documents. Send it for signature from there whenever it's ready.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
