import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, CheckCircle, FileText, Lock, PenTool, Check, X, ChevronDown, Clock } from 'lucide-react';
import PDFPageRenderer from '@/components/esign/PDFPageRenderer';
import SignatureCaptureModal from '@/components/esign/SignatureCaptureModal';
import { fieldStyle, fieldSignerIndex, isPrefilled } from '../../shared/esignGeometry.js';

// The page signers reach from their email link: /sign?token=...
// Uses the same document layout as the field editor, so every box lines up.

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

export default function PublicSigner() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState({ loading: true });
  const [layout, setLayout] = useState(null);
  const [values, setValues] = useState({});
  const [adopted, setAdopted] = useState({ signature: null, initial: null });
  const [active, setActive] = useState(null); // field being filled
  const [showConsent, setShowConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const fieldEls = useRef({});

  useEffect(() => {
    if (!token) return setState({ error: 'This signing link is missing its code. Please use the link from your email.' });
    api('getSubmissionByToken', { token })
      .then((data) => setState({ ...data, loading: false }))
      .catch((err) => setState({ error: err.message }));
  }, [token]);

  const { document: doc, signer, signerIndex } = state;
  const myFields = useMemo(
    () => (doc?.fields || []).filter((f) => fieldSignerIndex(f) === signerIndex),
    [doc, signerIndex],
  );
  const toFill = myFields.filter((f) => !isPrefilled(f));
  const required = toFill.filter((f) => f.required !== false);
  const remaining = required.filter((f) => !values[f.id]);
  const needsDefault = myFields.length === 0;
  const ready = needsDefault ? !!values.default : remaining.length === 0;

  const goNext = () => {
    const next = remaining[0] || toFill.find((f) => !values[f.id]);
    const el = next && fieldEls.current[next.id];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const fill = (field) => {
    if (isPrefilled(field)) return;
    if (field.type === 'date') return setValues((v) => ({ ...v, [field.id]: v[field.id] || today() }));
    if ((field.type === 'signature' || field.type === 'initial') && adopted[field.type] && !values[field.id]) {
      return setValues((v) => ({ ...v, [field.id]: adopted[field.type] }));
    }
    setActive(field);
  };

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const signedFields = Object.entries(values).map(([field_id, value]) => ({ field_id, value }));
      const res = await api('submitSignature', { submissionToken: token, signedFields, userAgent: navigator.userAgent });
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
  if (done) {
    return (
      <Message
        icon={<CheckCircle className="w-14 h-14 text-green-500" />}
        title="You're done. Thank you!"
        text={done.completed
          ? 'Everyone has signed. The completed PDF is on its way to your inbox.'
          : "Your signature is recorded. You'll get the completed PDF by email once everyone has signed."}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{doc.title}</p>
            <p className="text-xs text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Secure signing · from {state.senderName || 'your agent'}</p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[11px] text-gray-500">Signing as</p>
          <p className="text-sm font-medium text-gray-800 truncate max-w-[40vw]">{signer.name || signer.email}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-2 sm:px-4 py-4 pb-32">
        {state.message && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3 text-sm text-gray-700 whitespace-pre-wrap">{state.message}</div>
        )}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 text-sm text-blue-800 flex items-center gap-2">
          <PenTool className="w-4 h-4 flex-shrink-0" />
          {needsDefault
            ? 'Review the document, then add your signature below.'
            : 'Tap each highlighted box to fill it in. Your first signature is reused for the rest.'}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <PDFPageRenderer url={doc.document_url} onLayout={setLayout}>
            {layout && (doc.fields || []).filter((f) => isPrefilled(f) || fieldSignerIndex(f) === signerIndex).map((field) => {
              const style = fieldStyle(field, layout.ratio);
              const val = isPrefilled(field) ? field.value : values[field.id];
              const mine = !isPrefilled(field);
              const isImage = val && (field.type === 'signature' || field.type === 'initial');
              return (
                <div
                  key={field.id}
                  ref={(el) => (fieldEls.current[field.id] = el)}
                  className={`absolute z-10 rounded-[3px] flex items-center overflow-hidden ${mine ? 'cursor-pointer' : ''}`}
                  style={{
                    ...style,
                    border: val ? '1px solid transparent' : '2px dashed #2563eb',
                    background: val ? (mine ? 'rgba(254,249,195,0.55)' : 'transparent') : 'rgba(219,234,254,0.85)',
                  }}
                  onClick={() => mine && (val && field.type !== 'date' ? setActive(field) : fill(field))}
                >
                  {isImage ? (
                    <img src={val} alt="" className="w-full h-full object-contain" />
                  ) : val ? (
                    <span className="px-1 text-gray-900 truncate" style={{ fontSize: 'clamp(9px, 1.6vw, 14px)' }}>{val}</span>
                  ) : (
                    <span className="w-full text-center text-[11px] font-semibold text-blue-700 truncate px-1">
                      {field.type === 'initial' ? 'Initial' : field.type === 'date' ? 'Date' : field.type === 'text' ? 'Type here' : 'Sign here'}
                      {field.required === false ? ' (optional)' : ''}
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

      <footer className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 p-3 sm:p-4 shadow-lg z-30">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {!needsDefault && (
            <div className="text-xs text-gray-500 min-w-[88px]">
              <span className="font-semibold text-blue-600">{required.length - remaining.length}</span> of {required.length} done
            </div>
          )}
          {!ready && !needsDefault ? (
            <Button onClick={goNext} className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700" size="lg">
              Next field <ChevronDown className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={() => setShowConsent(true)} disabled={!ready} className="flex-1 gap-2 bg-green-600 hover:bg-green-700" size="lg">
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
            setValues((v) => ({ ...v, [active.id]: dataUrl }));
            setActive(null);
          }}
        />
      )}
      {active && active.type === 'text' && (
        <TextModal
          initial={values[active.id] || ''}
          onCancel={() => setActive(null)}
          onAccept={(text) => { setValues((v) => ({ ...v, [active.id]: text })); setActive(null); }}
        />
      )}

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

function TextModal({ initial, onAccept, onCancel }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Fill in this field</h3>
          <button onClick={onCancel} aria-label="Close"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={500}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
          <Button onClick={() => onAccept(value.trim())} disabled={!value.trim()} className="flex-1 bg-blue-600 hover:bg-blue-700">Done</Button>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">{children}</div>;
}

function Message({ icon, title, text }) {
  return (
    <Centered>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-4">{icon}</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-500">{text}</p>
      </div>
    </Centered>
  );
}
