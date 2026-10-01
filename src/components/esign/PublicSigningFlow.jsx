import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import SignaturePad from '@/components/esign/SignaturePad';
import { format } from 'date-fns';

export default function PublicSigningFlow({ open, onClose, onSubmit, document, signerEmail, isPending }) {
  const [step, setStep] = useState('consent'); // consent, sign, confirm
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [signingError, setSigningError] = useState(null);
  const [signingData, setSigningData] = useState({
    signature: '',
    fullName: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    consentAgreed: false,
    emailVerified: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const handleNext = () => {
    if (step === 'consent' && consentAgreed) {
      setStep('sign');
      setSigningError(null);
    }
  };

  const handleSubmit = () => {
    if (!signingData.fullName || !signingData.signature || !signingData.consentAgreed || !signingData.emailVerified) {
      setSigningError('Please fill in all required fields');
      return;
    }
    setSigningError(null);
    onSubmit(signingData);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
        {/* Consent Step */}
        {step === 'consent' && (
          <>
            <DialogHeader>
              <DialogTitle>Electronic Signature Consent & Disclosure</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 text-sm">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="font-semibold text-blue-900 mb-2">Legal Notice</p>
                <p className="text-blue-800 text-xs leading-relaxed">
                  By proceeding, you consent to use electronic signatures in accordance with the E-SIGN Act and UETA. Your electronic signature has the same legal effect as a handwritten signature.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-3">Your Rights:</h3>
                <ul className="space-y-2 text-xs text-muted-foreground list-disc list-inside">
                  <li>Right to request a paper copy</li>
                  <li>Electronic signature is legally binding</li>
                  <li>You're agreeing to receive documents electronically</li>
                  <li>Must have ability to access and retain records</li>
                  <li>Signature is enforceable by law</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-3">Document Info:</h3>
                <ul className="space-y-2 text-xs text-muted-foreground list-disc list-inside">
                  <li><strong>Document:</strong> {document?.title}</li>
                  <li><strong>Retention:</strong> Records retained 7 years minimum</li>
                  <li><strong>Authentication:</strong> Timestamp & audit trail recorded</li>
                  <li><strong>Signer Email:</strong> {signerEmail}</li>
                </ul>
              </div>

              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <input
                  type="checkbox"
                  checked={consentAgreed}
                  onChange={(e) => setConsentAgreed(e.target.checked)}
                  className="mt-1.5 w-4 h-4 rounded border-border cursor-pointer flex-shrink-0"
                />
                <span className="text-xs text-foreground leading-relaxed">
                  I consent to use electronic signatures and acknowledge that I've read and agree to this disclosure. I understand my electronic signature is legally binding and enforceable.
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Decline</Button>
              <Button onClick={handleNext} disabled={!consentAgreed}>
                I Agree & Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Signing Step */}
        {step === 'sign' && (
          <>
            <DialogHeader>
              <DialogTitle>Complete Your Electronic Signature</DialogTitle>
            </DialogHeader>
            {signingError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
                {signingError}
              </div>
            )}
            <div className="space-y-4 py-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">Legal Declaration</p>
                <p>By signing below, you electronically sign this document with legal effect equal to handwritten signature, in compliance with federal and state laws.</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-foreground block mb-2">Full Name *</label>
                <Input
                  value={signingData.fullName}
                  onChange={(e) => setSigningData({ ...signingData, fullName: e.target.value })}
                  placeholder="Your full name"
                  className="rounded-lg"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-foreground block mb-2">Signature *</label>
                <SignaturePad
                  onSignatureChange={(sig) => setSigningData({ ...signingData, signature: sig })}
                  initialValue={signingData.signature}
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-foreground block mb-2">Date *</label>
                <Input
                  type="date"
                  value={signingData.date}
                  onChange={(e) => setSigningData({ ...signingData, date: e.target.value })}
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-3 border-t border-border pt-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-blue-900 mb-1">Signing Confirmation</p>
                  <p className="text-xs text-blue-800 leading-relaxed">
                    By clicking "Sign", you confirm your intent to sign and agree to use electronic records and signatures. Your signature will be legally binding.
                  </p>
                </div>

                <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                  <p><strong>Date/Time:</strong> {format(new Date(), 'MMMM d, yyyy h:mm a')}</p>
                  <p><strong>Timezone:</strong> {signingData.timezone}</p>
                  <p className="text-[10px]"><strong>Timestamp:</strong> {new Date().toISOString()}</p>
                </div>

                <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-muted/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={signingData.consentAgreed}
                    onChange={(e) => setSigningData({ ...signingData, consentAgreed: e.target.checked })}
                    className="mt-1.5 w-4 h-4 rounded border-border cursor-pointer flex-shrink-0"
                  />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    I agree to sign this document electronically. I understand my electronic signature is legally binding.
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-muted/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={signingData.emailVerified}
                    onChange={(e) => setSigningData({ ...signingData, emailVerified: e.target.checked })}
                    className="mt-1.5 w-4 h-4 rounded border-border cursor-pointer flex-shrink-0"
                  />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    I verify I am the authorized signer for <strong>{signerEmail}</strong> and have authority to sign this document.
                  </span>
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('consent')} disabled={isPending}>Back</Button>
              <Button
                onClick={handleSubmit}
                disabled={!signingData.fullName || !signingData.signature || !signingData.consentAgreed || !signingData.emailVerified || isPending}
              >
                {isPending ? 'Signing...' : 'Sign Document'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}