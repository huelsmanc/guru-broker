import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, CheckCircle, FileText, Lock, PenTool, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PDFPageRenderer from '@/components/esign/PDFPageRenderer';

function TextInputModal({ onAccept, onCancel, fieldType }) {
  const [value, setValue] = useState(fieldType === 'date' ? new Date().toLocaleDateString() : '');
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">{fieldType === 'date' ? '📅 Enter Date' : '✏️ Enter Text'}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {fieldType === 'date' ? (
            <input type="date" value={value} onChange={(e) => setValue(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
          ) : (
            <input type="text" value={value} onChange={(e) => setValue(e.target.value)}
              placeholder="Type here..." autoFocus
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button onClick={() => onAccept(value)} disabled={!value.trim()} className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2">
              <Check className="w-4 h-4" /> Confirm
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SignaturePadModal({ onAccept, onCancel, label = 'Signature' }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [mode, setMode] = useState('draw');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [mode]);

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleAccept = () => {
    if (mode === 'type') {
      if (!typedName.trim()) return;
      const c = document.createElement('canvas');
      c.width = 400; c.height = 100;
      const cx = c.getContext('2d');
      cx.fillStyle = 'white'; cx.fillRect(0, 0, 400, 100);
      cx.fillStyle = '#1e40af';
      cx.font = 'italic 42px Georgia, serif';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(typedName, 200, 50);
      onAccept(c.toDataURL());
    } else {
      onAccept(canvasRef.current.toDataURL());
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Add Your {label}</h3>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setMode('draw')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'draw' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Draw
            </button>
            <button onClick={() => setMode('type')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'type' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Type
            </button>
          </div>
          {mode === 'draw' ? (
            <div>
              <canvas ref={canvasRef} width={400} height={120}
                className="w-full border-2 border-dashed border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
                onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
              <p className="text-xs text-gray-400 mt-1 text-center">Draw your {label.toLowerCase()} above</p>
              {hasDrawn && <button onClick={clearCanvas} className="text-xs text-red-500 hover:underline mt-1">Clear</button>}
            </div>
          ) : (
            <div>
              <input type="text" value={typedName} onChange={(e) => setTypedName(e.target.value)}
                placeholder="Type your full name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-2xl italic font-serif text-blue-800 placeholder:text-gray-300 placeholder:not-italic placeholder:font-sans placeholder:text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-xs text-gray-400 mt-1">Your typed name will appear as a signature</p>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button onClick={handleAccept} disabled={mode === 'draw' ? !hasDrawn : !typedName.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2">
              <Check className="w-4 h-4" /> Accept
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConsentDialog({ signerName, documentTitle, onAgree, onDecline, isSubmitting }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-gray-900 text-lg">Electronic Signature Disclosure</h3>
          </div>
          <p className="text-sm text-gray-500">Please review and agree before submitting</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 space-y-3 max-h-48 overflow-y-auto">
            <p>By clicking <strong>"I Agree & Sign"</strong>, you consent to the following:</p>
            <ul className="list-disc list-inside space-y-1.5 text-gray-600">
              <li>You are signing <strong>"{documentTitle}"</strong> electronically.</li>
              <li>Your electronic signature is legally binding and has the same legal effect as a handwritten signature.</li>
              <li>You have had the opportunity to review the document in full before signing.</li>
              <li>You consent to conduct business electronically and to receive electronic records.</li>
              <li>Your signature, the date/time, and your IP address will be recorded for audit purposes.</li>
            </ul>
            <p className="text-gray-500 text-xs pt-1">This transaction is governed by the Electronic Signatures in Global and National Commerce Act (E-SIGN) and applicable state electronic signature laws.</p>
          </div>
          <p className="text-sm text-gray-600">Signing as: <strong className="text-gray-900">{signerName}</strong></p>
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onDecline} disabled={isSubmitting} className="flex-1">Decline</Button>
            <Button onClick={onAgree} disabled={isSubmitting} className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              I Agree & Sign
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PublicSigner() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [submission, setSubmission] = useState(null);
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [signedFields, setSignedFields] = useState({});
  const [activeField, setActiveField] = useState(null);
  const [showConsent, setShowConsent] = useState(false);
  const [imgHeight, setImgHeight] = useState(null);
  const imgRef = useRef(null);

  const signer = submission?.signers?.find(s => s.token === token);
  const signerIndex = submission?.signers?.findIndex(s => s.token === token) ?? 0;
  const myFields = (doc?.fields || []).filter(f => (f.signer_index ?? 0) === signerIndex);
  // Fields that need signer input — exclude admin pre-filled (read-only) fields
  const requiredFields = myFields.filter(f => f.required !== false && !(f.value?.trim()));
  const allRequiredSigned = requiredFields.every(f => signedFields[f.id]);

  useEffect(() => {
    const fetchSubmission = async () => {
      if (!token) { setError('No signing token provided'); setLoading(false); return; }
      try {
        const res = await fetch('/api/functions/getSubmissionByToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const found = await res.json();
        if (!found) { setError('Invalid or expired signing link'); setLoading(false); return; }
        setSubmission(found.submission);
        setDoc(found.document);

        // numPages is set by PDFPageRenderer via onHeightReady callback
        // For images, imgHeight state handles it
      } catch (err) {
        setError('Failed to load document: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSubmission();
  }, [token]);

  // No pre-fill needed — field.value is read directly in renderField for admin-typed values

  const submitMutation = useMutation({
    mutationFn: async () => {
      const ipAddress = await fetch('https://api.ipify.org?format=json')
        .then(r => r.json()).then(d => d.ip).catch(() => 'unknown');
      const fields = Object.entries(signedFields).map(([field_id, value]) => ({ field_id, value }));
      const res = await fetch('/api/functions/submitSignature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionToken: token, signedFields: fields, ipAddress, userAgent: navigator.userAgent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      return data;
    },
    onSuccess: () => setSuccess(true),
    onError: (err) => setError(err.message || 'Failed to submit signature'),
  });

  const handleFieldClick = (field) => {
    // Pre-filled fields are read-only
    if (field.value && field.value.trim()) return;
    setActiveField({ fieldId: field.id, fieldType: field.type });
  };

  const handleSignatureAccepted = (value) => {
    setSignedFields(prev => ({ ...prev, [activeField.fieldId]: value }));
    setActiveField(null);
  };

  const renderField = (field) => {
    const isTextOrDate = field.type === 'text' || field.type === 'date';
    // Pre-filled by admin in editor — always read-only
    const prefilledValue = field.value && field.value.trim() ? field.value : null;
    const signedValue = signedFields[field.id];
    const displayValue = prefilledValue || signedValue;
    const isSigned = !!signedValue;

    // Read-only pre-filled field (admin typed this value — signer cannot edit)
    if (prefilledValue) {
      return (
        <div key={field.id} className="absolute z-10"
          style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, height: `${field.height || 40}px`, pointerEvents: 'none', userSelect: 'none' }}>
          <div className="w-full h-full bg-yellow-100 border-2 border-yellow-400 rounded flex items-center px-2 text-xs text-gray-900 font-semibold overflow-hidden">
            {prefilledValue}
          </div>
        </div>
      );
    }

    return (
      <div key={field.id} className="absolute cursor-pointer z-10"
        style={{ left: `${field.x}%`, top: `${field.y}%`, width: `${field.width}%`, height: `${field.height || 40}px` }}
        onClick={() => handleFieldClick(field)}>
        {isSigned ? (
          isTextOrDate
            ? <div className="w-full h-full bg-yellow-50 border border-yellow-300 rounded flex items-center px-2 text-xs text-gray-800 font-medium overflow-hidden">{signedValue}</div>
            : <img src={signedValue} alt="signed" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full border-2 border-dashed border-blue-500 bg-blue-50/80 rounded flex items-center justify-center gap-1 hover:bg-blue-100/90 transition-colors">
            <PenTool className="w-3 h-3 text-blue-600" />
            <span className="text-xs font-medium text-blue-600">
              {field.type === 'initial' ? 'Initial' : field.type === 'date' ? 'Date' : field.type === 'text' ? 'Text' : 'Sign'}
            </span>
          </div>
        )}
      </div>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white border border-red-200 rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Signing Error</h1>
        <p className="text-sm text-gray-500">{error}</p>
      </motion.div>
    </div>
  );

  if (success) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Document Signed!</h1>
        <p className="text-gray-500 mb-2">Your signature has been recorded successfully.</p>
        <p className="text-sm text-gray-400">You may close this window.</p>
      </motion.div>
    </div>
  );

  if (!submission || !doc) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (signer?.signed) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Already Signed</h1>
        <p className="text-gray-500">You have already signed this document.</p>
      </motion.div>
    </div>
  );

  const isPdf = doc.document_url?.toLowerCase().includes('.pdf') || doc.document_url?.includes('application/pdf');

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{doc.title}</p>
            <p className="text-xs text-gray-400 flex items-center gap-1"><Lock className="w-3 h-3" /> Secure signing</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Signing as</p>
          <p className="text-sm font-medium text-gray-800">{signer?.name || signer?.email}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 pb-24">
        {/* Progress */}
        {requiredFields.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-blue-600">{requiredFields.filter(f => signedFields[f.id]).length}</span> of <span className="font-semibold">{requiredFields.length}</span> required fields completed
            </p>
            <div className="flex gap-1">
              {requiredFields.map(f => (
                <div key={f.id} className={`w-3 h-3 rounded-full ${signedFields[f.id] ? 'bg-green-500' : 'bg-gray-200'}`} />
              ))}
            </div>
          </div>
        )}

        {/* Instruction */}
        {myFields.length > 0 && !allRequiredSigned && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-2">
            <PenTool className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-sm text-blue-700">Click on each highlighted field in the document to sign or initial.</p>
          </div>
        )}

        {/* Document — fields inside same container so they scroll together */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm" style={{ overflow: 'visible' }}>
          {isPdf ? (
            <PDFPageRenderer url={doc.document_url}>
              {myFields.map(field => renderField(field))}
            </PDFPageRenderer>
          ) : (
            <div className="relative" style={{ height: imgHeight ? `${imgHeight}px` : 'auto' }}>
              <img
                ref={imgRef}
                src={doc.document_url}
                alt={doc.title}
                className="w-full"
                onLoad={() => imgRef.current && setImgHeight(imgRef.current.offsetHeight)}
              />
              {imgHeight && myFields.map(field => renderField(field))}
            </div>
          )}
        </div>

        {/* No fields: simple signature box */}
        {myFields.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Your Signature</p>
            <button onClick={() => setActiveField({ fieldId: 'default', fieldType: 'signature' })}
              className="w-full border-2 border-dashed border-blue-400 rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-blue-50 transition-colors">
              {signedFields['default'] ? (
                <img src={signedFields['default']} alt="signature" className="max-h-16 object-contain" />
              ) : (
                <><PenTool className="w-6 h-6 text-blue-500" /><span className="text-sm text-blue-600 font-medium">Click to add signature</span></>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg">
        <div className="max-w-3xl mx-auto">
          <Button onClick={() => setShowConsent(true)}
            disabled={myFields.length > 0 ? !allRequiredSigned : !signedFields['default']}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-semibold gap-2" size="lg">
            <PenTool className="w-5 h-5" /> Finish & Submit Signature
          </Button>
          {myFields.length > 0 && !allRequiredSigned && (
            <p className="text-xs text-center text-gray-400 mt-2">Complete all required fields to continue</p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {activeField && (activeField.fieldType === 'text' || activeField.fieldType === 'date') && (
          <TextInputModal fieldType={activeField.fieldType} onAccept={handleSignatureAccepted} onCancel={() => setActiveField(null)} />
        )}
        {activeField && activeField.fieldType !== 'text' && activeField.fieldType !== 'date' && (
          <SignaturePadModal label={activeField.fieldType === 'initial' ? 'Initials' : 'Signature'}
            onAccept={handleSignatureAccepted} onCancel={() => setActiveField(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showConsent && (
          <ConsentDialog signerName={signer?.name || signer?.email} documentTitle={doc.title}
            isSubmitting={submitMutation.isPending}
            onAgree={() => submitMutation.mutate()} onDecline={() => setShowConsent(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}