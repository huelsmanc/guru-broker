import React, { useState, useRef, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { CheckCircle, ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

export default function BulkSign() {
  const { user, brokerageId } = useOutletContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const docPreviewRef = useRef(null);

  const [selectedDocs, setSelectedDocs] = useState(new Set());
  const [isSigningMode, setIsSigningMode] = useState(false);
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [signature, setSignature] = useState('');
  const [fullName, setFullName] = useState('');
  const [showConsent, setShowConsent] = useState(false);
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [completedDocs, setCompletedDocs] = useState(new Set());
  const [submittingCount, setSubmittingCount] = useState(0);

  const { data: pendingDocs = [] } = useQuery({
    queryKey: ['my-pending-documents', user?.email, brokerageId],
    queryFn: async () => {
      const allDocs = await base44.entities.ESignDocument.filter(
        { brokerage_id: brokerageId, status: 'pending' },
        '-created_date',
        100
      );
      return allDocs.filter(doc =>
        doc.signatories?.some(s => s.email === user?.email && !s.signed)
      );
    },
    enabled: !!user?.email && !!brokerageId,
  });

  const signDocuments = useMutation({
    mutationFn: async () => {
      const docsToSign = Array.from(selectedDocs)
        .map(id => pendingDocs.find(d => d.id === id))
        .filter(Boolean);

      for (const doc of docsToSign) {
        const sigIndex = doc.signatories.findIndex(s => s.email === user.email && !s.signed);
        if (sigIndex !== -1) {
          const updated = [...doc.signatories];
          updated[sigIndex] = {
            ...updated[sigIndex],
            signed: true,
            signed_date: new Date().toISOString(),
            signature,
          };
          const allSigned = updated.every(s => s.signed);

          await base44.entities.ESignDocument.update(doc.id, {
            signatories: updated,
            status: allSigned ? 'signed' : 'pending',
          });

          await base44.entities.ActivityLog.create({
            brokerage_id: brokerageId,
            document_id: doc.id,
            action_type: 'signed',
            user_email: user.email,
            user_name: user.full_name,
            details: 'Bulk signed document',
          });

          setCompletedDocs(prev => new Set([...prev, doc.id]));
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-pending-documents', user?.email, brokerageId] });
      setIsSigningMode(false);
      setSignature('');
      setFullName('');
      setConsentAgreed(false);
    },
  });

  const handleStartSigning = () => {
    if (selectedDocs.size === 0) {
      alert('Please select at least one document to sign');
      return;
    }
    setShowConsent(true);
  };

  const handleAgreeConsent = () => {
    if (!consentAgreed) return;
    setShowConsent(false);
    setIsSigningMode(true);
    setCurrentDocIndex(0);
  };

  const currentDoc = isSigningMode ? Array.from(selectedDocs)[currentDocIndex] : null;
  const currentDocData = currentDoc ? pendingDocs.find(d => d.id === currentDoc) : null;
  const docsToSignArray = Array.from(selectedDocs).map(id => pendingDocs.find(d => d.id === id)).filter(Boolean);
  const progress = Math.round(((currentDocIndex + 1) / docsToSignArray.length) * 100);

  const toggleDocSelection = (docId) => {
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocs(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedDocs.size === pendingDocs.length) {
      setSelectedDocs(new Set());
    } else {
      setSelectedDocs(new Set(pendingDocs.map(d => d.id)));
    }
  };

  const handleNext = async () => {
    if (!signature.trim()) {
      alert('Please enter your signature');
      return;
    }

    const docToSign = docsToSignArray[currentDocIndex];
    const sigIndex = docToSign.signatories.findIndex(s => s.email === user.email && !s.signed);

    if (sigIndex !== -1) {
      // Verify document integrity before signing
      setSubmittingCount(prev => prev + 1);
      try {
        const integrityCheck = await base44.functions.invoke('verifyDocumentIntegrity', { docId: docToSign.id });
        if (!integrityCheck.data.verified) {
          throw new Error('Document integrity verification failed - document may have been tampered with');
        }

        const updated = [...docToSign.signatories];
        updated[sigIndex] = {
          ...updated[sigIndex],
          signed: true,
          signed_date: new Date().toISOString(),
          signature,
        };
        const allSigned = updated.every(s => s.signed);

        const updateData = {
          signatories: updated,
          status: allSigned ? 'signed' : 'pending',
          hash_verified: true,
        };

        // If all signed, preserve final version
        if (allSigned) {
          updateData.final_signed_document_url = docToSign.document_url;
          const newVersion = (docToSign.versions?.length || 0) + 1;
          updateData.versions = [
            ...(docToSign.versions || []),
            {
              version: newVersion,
              document_url: docToSign.document_url,
              created_date: new Date().toISOString(),
              description: `All signatories completed signing (${updated.length} signatures)`,
            },
          ];
        }

        await base44.entities.ESignDocument.update(docToSign.id, updateData);

        // Generate audit trail PDF if all signatories have signed
        if (allSigned) {
          try {
            await base44.functions.invoke('generateAuditTrailPDF', { docId: docToSign.id });
          } catch (err) {
            console.error('Failed to generate audit trail PDF:', err);
          }
        }

        // Capture signing metadata (IP, device, location)
        try {
          await base44.functions.invoke('captureSigningMetadata', {
            docId: docToSign.id,
            email: user.email,
            name: user.full_name,
            brokerageId,
          });
        } catch (err) {
          // Fallback if metadata capture fails
          await base44.entities.ActivityLog.create({
            brokerage_id: brokerageId,
            document_id: docToSign.id,
            action_type: 'signed',
            user_email: user.email,
            user_name: user.full_name,
            details: 'Signed via bulk signing flow',
          });
        }

        setCompletedDocs(prev => new Set([...prev, docToSign.id]));

        if (currentDocIndex + 1 < docsToSignArray.length) {
          setCurrentDocIndex(currentDocIndex + 1);
        } else {
          setIsSigningMode(false);
          queryClient.invalidateQueries({ queryKey: ['my-pending-documents', user?.email, brokerageId] });
          setSignature('');
          setSelectedDocs(new Set());
          setCompletedDocs(new Set());
        }
      } catch (error) {
        alert('Error signing document: ' + error.message);
      } finally {
        setSubmittingCount(prev => prev - 1);
      }
    }
  };

  if (!brokerageId) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <div className="text-center py-16">
          <p className="text-muted-foreground">You are not associated with a brokerage.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/JoinBrokerage')}>
            Join a Brokerage
          </Button>
        </div>
      </div>
    );
  }

  if (isSigningMode && currentDocData) {
    return (
      <div className="h-screen lg:h-screen flex flex-col bg-gradient-to-br from-background to-muted">
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-card border-b border-border">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Signing Documents</h1>
            <div className="flex items-center gap-4 mt-2">
              <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                {currentDocIndex + 1} of {docsToSignArray.length}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex gap-6 p-6">
          {/* Document Preview */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-foreground">{currentDocData.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Created by {currentDocData.created_by_name} • {format(new Date(currentDocData.created_date), 'MMM d, yyyy')}
              </p>
            </div>
            <div
              ref={docPreviewRef}
              className="flex-1 bg-white rounded-lg overflow-auto shadow-sm border border-border flex items-center justify-center"
            >
              <img
                src={currentDocData.document_url}
                alt="Document"
                className="max-w-full max-h-full object-contain p-4"
              />
            </div>
          </div>

          {/* Signing Panel */}
          <div className="w-80 flex flex-col gap-4">
            <div className="bg-card rounded-lg border border-border p-4 space-y-4 flex-1">
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Full Name</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="text-sm rounded-lg"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Signature</label>
                <Input
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Type your signature"
                  className="text-sm rounded-lg font-signature text-lg"
                />
              </div>

              <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Legal Declaration</p>
                <p>By signing, you certify that this signature is legally binding and authentic under ESIGN and UETA acts.</p>
                <p className="text-[10px]">Timestamp: {new Date().toISOString()}</p>
              </div>

              <div className="space-y-2 pt-4 border-t border-border">
                <p className="text-xs font-medium text-foreground">Remaining Documents</p>
                <div className="space-y-1">
                  {docsToSignArray.map((doc, idx) => (
                    <div
                      key={doc.id}
                      className={`text-xs p-2 rounded flex items-center gap-2 ${
                        idx === currentDocIndex
                          ? 'bg-primary/10 border border-primary text-foreground'
                          : completedDocs.has(doc.id)
                          ? 'bg-accent/10 text-accent line-through'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {completedDocs.has(doc.id) ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <span className="w-3 h-3 rounded-full border border-current" />
                      )}
                      <span className="truncate">{doc.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              {currentDocIndex > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setCurrentDocIndex(currentDocIndex - 1)}
                  className="flex-1 gap-2 rounded-lg"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
              )}
              <Button
                onClick={handleNext}
                disabled={!signature.trim() || submittingCount > 0}
                className={`flex-1 gap-2 rounded-lg ${currentDocIndex + 1 === docsToSignArray.length ? 'bg-accent hover:bg-accent/90' : ''}`}
              >
                {submittingCount > 0 ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Signing...
                  </>
                ) : currentDocIndex + 1 === docsToSignArray.length ? (
                  <>
                    <CheckCircle className="w-4 h-4" /> Complete
                  </>
                ) : (
                  <>
                    Next <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <FileText className="w-7 h-7 text-primary" />
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">Bulk Sign Documents</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Review and sign multiple documents in one flow</p>
        </div>
      </div>

      {pendingDocs.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-12 text-center"
        >
          <FileText className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-muted-foreground">No pending documents to sign</p>
        </motion.div>
      ) : (
        <>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDocs.size === pendingDocs.length && pendingDocs.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">
                  {selectedDocs.size > 0
                    ? `${selectedDocs.size} selected`
                    : `Select all ${pendingDocs.length}`}
                </span>
              </label>
            </div>
            <Button
              onClick={handleStartSigning}
              disabled={selectedDocs.size === 0}
              className="gap-2 rounded-xl"
            >
              <CheckCircle className="w-4 h-4" /> Start Signing ({selectedDocs.size})
            </Button>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
              {pendingDocs.map((doc, i) => (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={`bg-card rounded-2xl border p-4 transition-all cursor-pointer ${
                    selectedDocs.has(doc.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30'
                  }`}
                  onClick={() => toggleDocSelection(doc.id)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedDocs.has(doc.id)}
                      onChange={() => {}}
                      className="w-4 h-4 rounded border-border mt-1 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{doc.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Created by {doc.created_by_name} • {format(new Date(doc.created_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <a
                      href={doc.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors font-medium flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View
                    </a>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Consent Dialog */}
      <Dialog open={showConsent} onOpenChange={setShowConsent}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Electronic Signature Consent & Disclosure</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-sm max-h-[60vh] overflow-y-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="font-semibold text-blue-900 mb-2">Important Legal Notice</p>
              <p className="text-blue-800 text-xs">
                By proceeding, you consent to electronically sign {selectedDocs.size} document{selectedDocs.size !== 1 ? 's' : ''} in compliance with ESIGN and UETA acts.
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-foreground">Your Rights:</h3>
              <ul className="space-y-2 text-xs text-muted-foreground list-disc list-inside">
                <li>Your electronic signature has the same legal effect as handwritten</li>
                <li>These signatures are legally binding and enforceable</li>
                <li>Audit trails and timestamps will be recorded</li>
                <li>Records will be retained for 7 years minimum</li>
              </ul>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={consentAgreed}
                onChange={(e) => setConsentAgreed(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-border cursor-pointer"
              />
              <span className="text-xs text-foreground leading-relaxed">
                I consent to electronically sign these {selectedDocs.size} document{selectedDocs.size !== 1 ? 's' : ''} and acknowledge that my signatures are legally binding.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConsent(false)}>
              Decline
            </Button>
            <Button onClick={handleAgreeConsent} disabled={!consentAgreed}>
              I Agree & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}