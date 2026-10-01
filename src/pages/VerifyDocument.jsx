import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, ShieldAlert, Loader2, FileCheck2, Upload, AlertCircle } from 'lucide-react';

// Public page behind the QR code on every signing certificate: /verify?id=<request id>.
// Shows the signing record and checks a PDF someone has against the sealed original,
// entirely in the browser (the file is never uploaded).

async function sha256(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '');

export default function VerifyDocument() {
  const [params] = useSearchParams();
  const id = params.get('id');
  const [rec, setRec] = useState(null);
  const [error, setError] = useState(null);
  const [check, setCheck] = useState(null); // { name, match } | 'working'
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    if (!id) { setError('This link is missing the document ID.'); return; }
    fetch('/api/fn/esignVerify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Not found'); setRec(d); })
      .catch((e) => setError(e.message));
  }, [id]);

  const compare = async (file) => {
    if (!file) return;
    setCheck('working');
    const h = await sha256(file);
    setCheck({ name: file.name, match: h === rec.final_sha256, isOriginal: h === rec.original_sha256 });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 flex items-start sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 max-w-lg w-full overflow-hidden">
        <div className="bg-[#1e3a5f] text-white px-6 py-5 flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-green-300 flex-shrink-0" />
          <div>
            <p className="text-xs uppercase tracking-wider text-blue-200">Guru Broker E-Sign</p>
            <h1 className="text-lg font-bold">Signature verification</h1>
          </div>
        </div>
        <div className="p-6 space-y-5">
          {error ? (
            <p className="text-sm text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> {error}</p>
          ) : !rec ? (
            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Looking up the record…</p>
          ) : (
            <>
              <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                <p className="font-semibold text-green-900 flex items-center gap-2"><FileCheck2 className="w-5 h-5" /> Completed signing record found</p>
                <p className="text-sm text-green-900 mt-1 break-words">"{rec.title}"</p>
                <p className="text-xs text-green-800 mt-1">Sent{rec.sent_by ? ` by ${rec.sent_by}` : ''} {when(rec.sent_at)} · completed {when(rec.completed_at)}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-2">Signed by</p>
                <ul className="space-y-1.5">
                  {rec.signers.map((s, i) => (
                    <li key={i} className="text-sm flex items-center justify-between gap-2 border-b border-gray-100 pb-1.5">
                      <span><span className="font-medium">{s.name}</span> <span className="text-gray-400">{s.email}</span></span>
                      <span className="text-xs text-gray-500 flex-shrink-0">{when(s.signed_at)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1">Check your copy</p>
                <p className="text-xs text-gray-500 mb-2">Drop the signed PDF here. We compare its fingerprint with the sealed original, right in your browser. The file isn't uploaded.</p>
                <label
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); compare(e.dataTransfer.files?.[0]); }}
                  className={`block border-2 border-dashed rounded-xl p-5 text-center cursor-pointer ${drag ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}`}>
                  <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => compare(e.target.files?.[0])} />
                  <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                  <span className="text-sm text-gray-600">Choose or drop the PDF</span>
                </label>
                {check === 'working' && <p className="text-sm text-gray-500 mt-2 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Checking…</p>}
                {check && check !== 'working' && (check.match ? (
                  <p className="mt-3 text-sm rounded-lg bg-green-50 border border-green-200 text-green-900 p-3 flex gap-2"><ShieldCheck className="w-5 h-5 flex-shrink-0" /> <span><strong>Match.</strong> "{check.name}" is exactly the signed document, unchanged since it was sealed.</span></p>
                ) : check.isOriginal ? (
                  <p className="mt-3 text-sm rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-3 flex gap-2"><ShieldAlert className="w-5 h-5 flex-shrink-0" /> <span>That's the original document as sent, before signatures. The signed copy is the one emailed after everyone signed.</span></p>
                ) : (
                  <p className="mt-3 text-sm rounded-lg bg-red-50 border border-red-200 text-red-900 p-3 flex gap-2"><ShieldAlert className="w-5 h-5 flex-shrink-0" /> <span><strong>No match.</strong> "{check.name}" is not the sealed signed copy. It may have been changed, or it's a different file (for example, the copy without the certificate pages).</span></p>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 break-all">Signed copy SHA-256: {rec.final_sha256 || 'n/a'}{rec.sealed ? ' · digitally sealed' : ''}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
