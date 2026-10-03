import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, CheckCircle, FileText, Lock, PenTool, Check, X, ChevronDown, Clock, Sparkles, ShieldCheck, Paperclip, Users, ArrowRight, HandHelping, Calendar, Type, CaseSensitive } from 'lucide-react';
import PDFPageRenderer from '@/components/esign/PDFPageRenderer';
import SignatureCaptureModal from '@/components/esign/SignatureCaptureModal';
import { supabase } from '@/api/base44Client';
import { fieldStyle, fieldSignerIndex, isPrefilled, textPx, isTickType, fieldVisible } from '../../shared/esignGeometry.js';
import { moneyText } from '@/components/esign/dealKeys';
import { fieldLook, textCss, strikePx, STYLED_TYPES } from '../../shared/esignStyle.js';

// The page signers reach from their email link: /sign?token=...
// Uses the same document layout as the field editor, so every box lines up.
// Flow: (code check, if the sender asked for one) -> welcome -> guided filling -> agree & sign.

async function api(name, body) {
  const res = await fetch(`/api/fn/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

const today = () => new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
const proofKey = (token) => `esign-proof:${String(token || '').slice(0, 24)}`;
const readProof = (token) => { try { return sessionStorage.getItem(proofKey(token)); } catch { return null; } };
const saveProof = (token, p) => { try { sessionStorage.setItem(proofKey(token), p); } catch { /* private mode */ } };

const LABELS = { signature: 'Sign here', initial: 'Initial', date: 'Date', text: 'Type here', dropdown: 'Choose', attachment: 'Attach a file' };

export default function PublicSigner() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const inPerson = params.get('inperson') === '1';
  // Opened from inside Guru Broker (a checklist's "Sign now"): offer the way back afterwards.
  const back = /^\/(?!\/)/.test(params.get('back') || '') ? params.get('back') : '';
  const [proof, setProof] = useState(() => {
    const fromHash = (window.location.hash.match(/proof=([\w-]+)/) || [])[1];
    if (fromHash) { saveProof(token, fromHash); window.history.replaceState(null, '', window.location.pathname + window.location.search); return fromHash; }
    return readProof(token);
  });
  const [state, setState] = useState({ loading: true });
  const [started, setStarted] = useState(false);
  const [layout, setLayout] = useState(null);
  const [values, setValues] = useState({});
  const [adopted, setAdopted] = useState({ signature: null, initial: null });
  const [active, setActive] = useState(null); // field being filled
  const [current, setCurrent] = useState(null); // field the guide is pointing at
  const [showConsent, setShowConsent] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const fieldEls = useRef({});
  const fileInput = useRef(null);

  const load = (p = proof) => {
    if (!token) return setState({ error: 'This signing link is missing its code. Please use the link from your email.' });
    setState((s) => ({ ...s, loading: true }));
    api('getSubmissionByToken', { token, proof: p || undefined })
      .then((data) => setState({ ...data, loading: false }))
      .catch((err) => setState({ error: err.message }));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  // Let the sender see "viewing now" while this page is open.
  useEffect(() => {
    if (!state.submissionId || !started || state.alreadySigned) return;
    const ch = supabase.channel(`esign:${state.submissionId}`, { config: { presence: { key: state.signer?.name || 'signer' } } });
    ch.subscribe((status) => { if (status === 'SUBSCRIBED') ch.track({ name: state.signer?.name, at: new Date().toISOString(), in_person: inPerson }).catch(() => {}); });
    return () => { supabase.removeChannel(ch); };
  }, [state.submissionId, started, state.alreadySigned, state.signer?.name, inPerson]);

  const { document: doc, signer, signerIndex } = state;
  const allFields = doc?.fields || [];
  // Everything entered so far (and the sender's pre-filled values), for "only show when" boxes.
  const seen = useMemo(() => {
    const out = {};
    for (const f of allFields) out[f.id] = isPrefilled(f) ? f.value : values[f.id];
    return out;
  }, [allFields, values]);
  const myFields = useMemo(() => allFields.filter((f) => fieldSignerIndex(f) === signerIndex), [allFields, signerIndex]);
  const toFill = myFields.filter((f) => !isPrefilled(f) && fieldVisible(f, seen));

  // A "choose one" group counts once; checkboxes are optional unless marked required.
  const steps = useMemo(() => {
    const out = [];
    const groups = new Set();
    for (const f of toFill) {
      if (f.type === 'radio') {
        const g = f.group || 'group';
        if (groups.has(g)) continue;
        groups.add(g);
        const members = toFill.filter((x) => x.type === 'radio' && (x.group || 'group') === g);
        out.push({ key: `radio:${g}`, field: members[0], required: members.some((m) => m.required !== false), filled: members.some((m) => values[m.id] === 'X') });
      } else {
        const required = f.type === 'checkbox' ? f.required === true : f.required !== false;
        out.push({ key: f.id, field: f, required, filled: !!values[f.id] });
      }
    }
    return out.sort((a, b) => a.field.y - b.field.y || a.field.x - b.field.x);
  }, [toFill, values]);
  const adoptedRef = useRef(adopted);
  adoptedRef.current = adopted;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const required = steps.filter((s) => s.required);
  const remaining = required.filter((s) => !s.filled);
  const needsDefault = myFields.length === 0;
  const ready = needsDefault ? !!values.default : remaining.length === 0;
  const pct = needsDefault ? (values.default ? 100 : 0) : required.length ? Math.round(((required.length - remaining.length) / required.length) * 100) : 100;

  const focusField = (field, open) => {
    if (!field) return;
    setCurrent(field.id);
    fieldEls.current[field.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (open) setTimeout(() => fill(field), 350);
  };
  const goNext = (afterId) => {
    const order = stepsRef.current.filter((s) => !s.filled);
    const from = afterId ? allFields.find((f) => f.id === afterId) : null;
    const idx = from ? order.findIndex((s) => s.field.y > from.y + 0.01 || (Math.abs(s.field.y - from.y) <= 0.01 && s.field.x > from.x)) : 0;
    const next = (idx >= 0 ? order[idx] : null) || order.find((s) => s.required) || order[0];
    // Open the box for them when it needs input; an already-adopted signature still takes their tap.
    if (next) focusField(next.field, next.field.type === 'text' || (['signature', 'initial'].includes(next.field.type) && !adoptedRef.current[next.field.type]));
    else setCurrent(null);
  };

  const setValue = (id, v, advance = true) => {
    setValues((prev) => {
      const next = { ...prev };
      if (v == null || v === '') delete next[id]; else next[id] = v;
      return next;
    });
    if (advance) setTimeout(() => goNext(id), 150);
  };

  function fill(field) {
    if (isPrefilled(field)) return;
    if (field.type === 'date') return setValue(field.id, values[field.id] || today());
    if (field.type === 'checkbox') return setValue(field.id, values[field.id] === 'X' ? '' : 'X', false);
    if (field.type === 'radio') {
      const g = field.group || 'group';
      setValues((prev) => {
        const next = { ...prev };
        for (const f of myFields) if (f.type === 'radio' && (f.group || 'group') === g) delete next[f.id];
        next[field.id] = 'X';
        return next;
      });
      return setTimeout(() => goNext(field.id), 150);
    }
    if (field.type === 'attachment') { setActive(field); return fileInput.current?.click(); }
    if ((field.type === 'signature' || field.type === 'initial') && adopted[field.type] && !values[field.id]) {
      return setValue(field.id, adopted[field.type]);
    }
    setActive(field);
  }

  const attach = async (file) => {
    const field = active;
    setActive(null);
    if (!file || !field) return;
    if (file.size > 20 * 1024 * 1024) { setSubmitError('Files can be up to 20 MB.'); return; }
    setUploading(field.id);
    try {
      const slot = await api('esignAttach', { token, proof, name: file.name, size: file.size });
      const { error } = await supabase.storage.from('private-files').uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw new Error(error.message);
      setValue(field.id, slot.file_url);
    } catch (err) {
      setSubmitError(`Could not attach the file: ${err.message}`);
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Boxes hidden by their condition aren't sent.
      const visible = new Set(toFill.map((f) => f.id));
      const signedFields = Object.entries(values)
        .filter(([id]) => id === 'default' || visible.has(id))
        .map(([field_id, value]) => ({ field_id, value }));
      const res = await api('submitSignature', { submissionToken: token, signedFields, userAgent: navigator.userAgent, proof: proof || undefined });
      setDone(res);
      setShowConsent(false);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (state.loading) return <Centered><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></Centered>;
  if (state.error) return <Message icon={<AlertCircle className="w-12 h-12 text-red-400" />} title="This link can't be used" text={state.error} />;
  if (state.alreadySigned) return <Message icon={<CheckCircle className="w-12 h-12 text-green-500" />} title="Already signed" text={`You've already signed "${doc?.title}". You'll get the completed PDF by email once everyone has signed.`} />;
  if (state.waiting) return <Message icon={<Clock className="w-12 h-12 text-amber-500" />} title="Not your turn yet" text={`"${doc?.title}" is being signed in order. We'll email you as soon as it's your turn.`} />;
  if (state.needsCode) {
    return <CodeGate token={token} state={state} onVerified={(p) => { saveProof(token, p); setProof(p); load(p); }} />;
  }
  if (done) {
    return (
      <Message
        icon={<CheckCircle className="w-14 h-14 text-green-500" />}
        title={inPerson ? 'All signed. Thank you!' : "You're done. Thank you!"}
        text={done.completed
          ? 'Everyone has signed. The completed PDF is on its way to your inbox.'
          : "Your signature is recorded. You'll get the completed PDF by email once everyone has signed."}
        extra={inPerson ? <p className="text-xs text-gray-400 mt-4">You can hand the device back to your agent.</p>
          : back ? <a href={back} className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white">Back to Guru Broker</a> : null}
      />
    );
  }

  if (!started) {
    return (
      <Welcome state={state} inPerson={inPerson} count={steps.length} needsDefault={needsDefault}
        onExplain={() => setShowExplain(true)} explainOpen={showExplain} onCloseExplain={() => setShowExplain(false)}
        token={token} proof={proof}
        onStart={() => { setStarted(true); setTimeout(() => goNext(), 600); }} />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{doc.title}</p>
              <p className="text-xs text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Secure signing · from {state.senderName || 'your agent'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={() => setShowExplain(true)} className="hidden sm:inline-flex items-center gap-1 text-xs text-purple-700 border border-purple-200 rounded-full px-2.5 py-1 hover:bg-purple-50">
              <Sparkles className="w-3.5 h-3.5" /> Explain this
            </button>
            <div className="text-right">
              <p className="text-[11px] text-gray-500">Signing as</p>
              <p className="text-sm font-medium text-gray-800 truncate max-w-[36vw]">{signer.name || signer.email}</p>
            </div>
          </div>
        </div>
        <div className="h-1 bg-gray-100"><div className="h-1 bg-green-500 transition-all duration-500" style={{ width: `${pct}%` }} /></div>
      </header>

      <main className="max-w-4xl mx-auto px-2 sm:px-4 py-4 pb-32">
        {inPerson && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm text-amber-900 flex items-center gap-2">
            <HandHelping className="w-4 h-4 flex-shrink-0" /> In-person signing for {signer.name || signer.email}. Your agent is with you.
          </div>
        )}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-sm text-blue-800 flex items-center gap-2">
          <PenTool className="w-4 h-4 flex-shrink-0" />
          {needsDefault
            ? 'Review the document, then add your signature below.'
            : 'Tap Next to go box by box. Your first signature is reused for the rest.'}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <PDFPageRenderer url={doc.document_url} onLayout={setLayout}>
            {layout && allFields.filter((f) => (isPrefilled(f) || fieldSignerIndex(f) === signerIndex) && fieldVisible(f, seen))
              .filter((f) => !(isPrefilled(f) && f.type !== 'strike' && !String(f.value || '').trim())).map((field) => {
              const style = fieldStyle(field, layout.ratio);
              const val = isPrefilled(field) ? field.value : values[field.id];
              const mine = !isPrefilled(field);
              const isImage = val && (field.type === 'signature' || field.type === 'initial');
              const isCurrent = current === field.id;
              if (field.type === 'strike') {
                return <div key={field.id} className="absolute z-10 pointer-events-none" style={style}><span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full" style={{ background: fieldLook(field).color, height: strikePx(field, layout.width) }} /></div>;
              }
              const optional = field.type === 'checkbox' ? field.required !== true : field.required === false;
              const ring = isCurrent ? '0 0 0 3px rgba(37,99,235,0.35), 0 6px 16px rgba(37,99,235,0.18)' : '0 1px 2px rgba(15,23,42,0.06)';
              const signType = field.type === 'signature' || field.type === 'initial';
              // Empty boxes: signature spots in warm gold, everything else in blue, with a solid tab on the left.
              const accent = signType ? '#d97706' : '#2563eb';
              const side = `1.5px solid ${accent}99`;
              const emptyLook = { borderTop: side, borderRight: side, borderBottom: side, borderLeft: `3px solid ${accent}`, background: signType ? 'linear-gradient(180deg, #fffbeb, #fef3c7)' : 'linear-gradient(180deg, #eff6ff, #dbeafe)' };
              if (isTickType(field.type)) {
                return (
                  <button type="button" key={field.id} ref={(el) => (fieldEls.current[field.id] = el)} onClick={() => mine && fill(field)}
                    title={field.label || undefined}
                    className={`absolute z-10 flex items-center justify-center ${field.type === 'radio' ? 'rounded-full' : 'rounded-[3px]'}`}
                    style={{ ...style, border: `1.5px solid ${val ? '#334155' : '#2563eb'}`, background: val ? '#fff' : 'linear-gradient(180deg, #eff6ff, #dbeafe)', boxShadow: ring }}>
                    {val === 'X' && (field.type === 'radio' ? <span className="w-1/2 h-1/2 rounded-full bg-gray-900" /> : <Check className="w-full h-full text-gray-900" strokeWidth={3} />)}
                  </button>
                );
              }
              if (field.type === 'dropdown' && mine) {
                return (
                  <select key={field.id} ref={(el) => (fieldEls.current[field.id] = el)} value={val || ''}
                    onChange={(e) => setValue(field.id, e.target.value)} onFocus={() => setCurrent(field.id)}
                    className="absolute z-10 rounded-[4px]"
                    style={{ ...style, ...textCss(field, layout.width), ...(val ? { borderTop: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', borderLeft: '1px solid #cbd5e1', background: '#fff' } : emptyLook), boxShadow: ring, padding: '0 2px' }}>
                    <option value="">{field.label || 'Choose…'}{optional ? ' (optional)' : ''}</option>
                    {(field.options || []).filter(Boolean).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                );
              }
              return (
                <div
                  key={field.id}
                  ref={(el) => (fieldEls.current[field.id] = el)}
                  className={`absolute z-10 rounded-[4px] flex items-center overflow-hidden transition-shadow ${mine ? 'cursor-pointer hover:brightness-[0.98]' : ''}`}
                  style={{
                    ...style,
                    ...(val ? { borderTop: '1px solid transparent', borderRight: '1px solid transparent', borderBottom: '1px solid transparent', borderLeft: '1px solid transparent', background: mine ? 'rgba(254,249,195,0.45)' : 'transparent' } : emptyLook),
                    boxShadow: val && !isCurrent ? 'none' : ring,
                  }}
                  onClick={() => mine && (val && !['date', 'attachment'].includes(field.type) ? setActive(field) : fill(field))}
                >
                  {uploading === field.id ? (
                    <span className="w-full flex items-center justify-center gap-1 text-[11px] text-blue-700"><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</span>
                  ) : isImage ? (
                    <img src={val} alt="" className="w-full h-full object-contain" />
                  ) : field.type === 'attachment' && val ? (
                    <span className="w-full text-[11px] text-blue-800 truncate px-1 flex items-center gap-1"><Paperclip className="w-3 h-3" /> Attached. Tap to replace</span>
                  ) : val ? (
                    <span className={`${STYLED_TYPES.has(field.type) && String(val).includes('\n') ? 'self-start' : ''} w-full whitespace-pre-wrap break-words`}
                      style={STYLED_TYPES.has(field.type) ? { ...textCss(field, layout.width), padding: '1px 4px' } : { fontSize: textPx(layout.width), lineHeight: 1.2, padding: '1px 4px', color: '#111827' }}>{val}</span>
                  ) : (
                    <span className="w-full flex items-center justify-center gap-1 px-1.5 min-w-0" style={{ color: signType ? '#b45309' : '#1d4ed8' }}>
                      {field.type === 'attachment' ? <Paperclip className="w-3.5 h-3.5 flex-shrink-0" /> : field.type === 'signature' ? <PenTool className="w-3.5 h-3.5 flex-shrink-0" /> : field.type === 'initial' ? <CaseSensitive className="w-3.5 h-3.5 flex-shrink-0" /> : field.type === 'date' ? <Calendar className="w-3.5 h-3.5 flex-shrink-0" /> : <Type className="w-3.5 h-3.5 flex-shrink-0" />}
                      <span className={`text-[11px] font-semibold truncate ${signType ? 'italic' : ''}`}>
                        {field.type === 'attachment' ? (field.label || 'Attach a file') : field.label || LABELS[field.type] || 'Sign here'}
                        {optional ? ' (optional)' : ''}
                      </span>
                    </span>
                  )}
                </div>
              );
            })}
          </PDFPageRenderer>
        </div>

        {needsDefault && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Your signature</p>
            <button onClick={() => setActive({ id: 'default', type: 'signature' })}
              className="w-full border-2 border-dashed border-blue-400 rounded-lg p-6 flex items-center justify-center hover:bg-blue-50">
              {values.default ? <img src={values.default} alt="Your signature" className="max-h-16" /> : <span className="text-sm text-blue-600 font-medium">Tap to sign</span>}
            </button>
          </div>
        )}
      </main>

      <input ref={fileInput} type="file" className="hidden" style={{ display: 'none' }} accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; attach(f); }} />

      <footer className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-3 sm:p-4 shadow-lg z-30">
        {submitError && !showConsent && <p className="max-w-4xl mx-auto text-xs text-red-600 mb-2">{submitError}</p>}
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {!needsDefault && (
            <div className="text-xs text-gray-500 min-w-[88px]">
              <span className="font-semibold text-blue-600">{required.length - remaining.length}</span> of {required.length} done
            </div>
          )}
          {!ready && !needsDefault ? (
            <Button onClick={() => goNext(current)} className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700" size="lg">
              Next <ChevronDown className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={() => setShowConsent(true)} disabled={!ready || !!uploading} className="flex-1 gap-2 bg-green-600 hover:bg-green-700" size="lg">
              <Check className="w-5 h-5" /> Finish signing
            </Button>
          )}
        </div>
      </footer>

      {active && (active.type === 'signature' || active.type === 'initial') && (
        <SignatureCaptureModal
          label={active.type === 'initial' ? 'Initials' : 'Signature'}
          defaultName={signer.name}
          onCancel={() => setActive(null)}
          onAccept={(dataUrl) => {
            const kind = active.type;
            setAdopted((a) => ({ ...a, [kind]: dataUrl }));
            setValue(active.id, dataUrl);
            setActive(null);
          }}
        />
      )}
      {active && active.type === 'text' && (
        <TextModal
          money={active.format === 'money'}
          label={active.label}
          initial={values[active.id] || ''}
          onCancel={() => setActive(null)}
          onAccept={(text) => { setValue(active.id, text); setActive(null); }}
        />
      )}
      {showExplain && <ExplainModal token={token} proof={proof} onClose={() => setShowExplain(false)} />}

      {showConsent && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg">
            <div className="p-5 border-b border-gray-200">
              <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2"><Lock className="w-5 h-5 text-blue-600" /> Agree to sign electronically</h3>
            </div>
            <div className="p-5 space-y-4 text-sm text-gray-700">
              <ul className="list-disc pl-5 space-y-1.5">
                <li>You're signing <strong>"{doc.title}"</strong> electronically, and your electronic signature is legally binding, like a handwritten one.</li>
                <li>You've had the chance to review the whole document.</li>
                <li>You agree to receive records electronically, including the signed copy by email.</li>
                <li>The date, time, your IP address and device are recorded for the audit trail.</li>
              </ul>
              <p className="text-xs text-gray-500">Governed by the federal E-SIGN Act and applicable state electronic signature laws. You may ask the sender for a paper copy.</p>
              {submitError && <p className="text-red-600 text-sm">{submitError}</p>}
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowConsent(false)} disabled={submitting} className="flex-1">Go back</Button>
                <Button onClick={submit} disabled={submitting} className="flex-1 bg-green-600 hover:bg-green-700 gap-2">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} I agree & sign
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Welcome({ state, inPerson, count, needsDefault, onStart, onExplain, explainOpen, onCloseExplain, token, proof }) {
  const { document: doc, signer, people = [], order } = state;
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-md w-full overflow-hidden">
        <div className="bg-[#1e3a5f] text-white px-6 py-5">
          <p className="text-xs uppercase tracking-wider text-blue-200">{inPerson ? 'In-person signing' : 'Document to sign'}</p>
          <h1 className="text-xl font-bold mt-1 break-words">{doc.title}</h1>
          <p className="text-sm text-blue-100 mt-1">From {state.senderName || 'your agent'}</p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">Hi {signer.name || signer.email},{' '}
            {needsDefault ? 'you just need to add your signature.' : `there ${count === 1 ? 'is 1 box' : `are ${count} boxes`} for you. We'll take you to each one.`}</p>
          {state.message && <div className="bg-gray-50 border-l-4 border-blue-500 rounded px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">{state.message}</div>}
          {people.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 flex items-center gap-1 mb-1.5"><Users className="w-3.5 h-3.5" /> Signers{order === 'in_order' ? ', in order' : ''}</p>
              <ol className="space-y-1">
                {people.map((p, i) => (
                  <li key={i} className={`flex items-center gap-2 text-sm ${p.me ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                    {p.signed ? <CheckCircle className="w-4 h-4 text-green-500" /> : p.me ? <ArrowRight className="w-4 h-4 text-blue-600" /> : <Clock className="w-4 h-4 text-gray-300" />}
                    {p.name}{p.me ? ' (you)' : ''}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <Button onClick={onStart} size="lg" className="w-full gap-2 bg-blue-600 hover:bg-blue-700">Start <ArrowRight className="w-4 h-4" /></Button>
          <button type="button" onClick={onExplain} className="w-full text-sm text-purple-700 flex items-center justify-center gap-1.5 py-1 hover:underline">
            <Sparkles className="w-4 h-4" /> Explain this document in plain English
          </button>
          <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1"><Lock className="w-3 h-3" /> Encrypted, recorded and sealed when complete</p>
        </div>
      </div>
      {explainOpen && <ExplainModal token={token} proof={proof} onClose={onCloseExplain} />}
    </div>
  );
}

function CodeGate({ token, state, onVerified }) {
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const send = async () => {
    setBusy(true); setErr(null);
    try { await api('esignCode', { token, action: 'send' }); setSent(true); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const check = async () => {
    setBusy(true); setErr(null);
    try { const r = await api('esignCode', { token, action: 'check', code }); onVerified(r.proof); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Centered>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-7 max-w-sm w-full text-center space-y-4">
        <ShieldCheck className="w-12 h-12 text-blue-600 mx-auto" />
        <div>
          <h1 className="text-lg font-bold text-gray-900">Confirm it's you</h1>
          <p className="text-sm text-gray-500 mt-1">{state.senderName || 'The sender'} asked us to check before you open "{state.document?.title}".</p>
        </div>
        {!sent ? (
          <Button onClick={send} disabled={busy} className="w-full bg-blue-600 hover:bg-blue-700">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : `Email a code to ${state.signer?.email}`}
          </Button>
        ) : (
          <>
            <p className="text-sm text-gray-600">Enter the 6-digit code we sent to <strong>{state.signer?.email}</strong>.</p>
            <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) check(); }}
              className="w-full text-center text-2xl tracking-[0.5em] font-mono border border-gray-300 rounded-lg py-3 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <Button onClick={check} disabled={busy || code.length !== 6} className="w-full bg-blue-600 hover:bg-blue-700">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Continue'}
            </Button>
            <button type="button" onClick={send} disabled={busy} className="text-xs text-blue-600 hover:underline">Send a new code</button>
          </>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </Centered>
  );
}

function ExplainModal({ token, proof, onClose }) {
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    api('esignExplain', { token, proof: proof || undefined }).then((r) => setRes(r.summary)).catch((e) => setErr(e.message));
  }, [token, proof]);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[85dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-purple-600" /> In plain English</h3>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-5 space-y-4 text-sm text-gray-700">
          {err ? <p className="text-red-600">{err}</p> : !res ? (
            <p className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Reading the document…</p>
          ) : (
            <>
              <p className="font-medium text-gray-900">{res.one_line}</p>
              <ul className="list-disc pl-5 space-y-1.5">{res.points.map((p, i) => <li key={i}>{p}</li>)}</ul>
              {res.watch_for?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="font-medium text-amber-900 mb-1">Worth asking about</p>
                  <ul className="list-disc pl-5 space-y-1 text-amber-900">{res.watch_for.map((p, i) => <li key={i}>{p}</li>)}</ul>
                </div>
              )}
            </>
          )}
          <p className="text-[11px] text-gray-400">Written by AI to help you read the document. It isn't legal advice and the document itself is what counts. Ask your agent or attorney about anything you're unsure of.</p>
        </div>
      </div>
    </div>
  );
}

function TextModal({ label, initial, onAccept, onCancel, money }) {
  const [value, setValue] = useState(initial);
  const done = () => onAccept(money ? moneyText(value) : value.trim());
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{label || 'Fill in this field'}</h3>
          <button onClick={onCancel} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        {money ? (
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">$</span>
            <input autoFocus inputMode="decimal" value={value.replace(/^\$/, '')} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) done(); }} placeholder="0.00"
              className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ) : (
          <textarea autoFocus rows={3} value={value} onChange={(e) => setValue(e.target.value)} maxLength={500}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base resize-y focus:outline-none focus:ring-2 focus:ring-blue-500" />
        )}
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button onClick={done} disabled={!value.trim()} className="flex-1 bg-blue-600 hover:bg-blue-700">Done</Button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">{children}</div>;
}

function Message({ icon, title, text, extra }) {
  return (
    <Centered>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-4">{icon}</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-500">{text}</p>
        {extra}
      </div>
    </Centered>
  );
}
