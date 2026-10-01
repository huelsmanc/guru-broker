import React, { useState } from 'react';
import { isPdfUrl } from './PDFPageRenderer';
import { autoDetectFields } from './autoDetectFields';
import { useOutletContext } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Loader2, Upload, Edit2, Users, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import ESignFieldEditor from './ESignFieldEditor';
import SignerManagementDashboard from './SignerManagementDashboard';

const STEPS = [
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'signers', label: 'Signers', icon: Users },
  { id: 'fields', label: 'Fields', icon: Edit2 },
  { id: 'send', label: 'Send', icon: Send },
];

// Also used from Transactions and the Contract Generator (replacing DocuSeal):
// pass `initialTitle` / `initialDocumentUrl` to start from an existing file and
// `transactionId` to link the signing request to a transaction.
export default function UnifiedESignCreator({
  onComplete,
  user: userProp,
  brokerageId: brokerageIdProp,
  initialTitle = '',
  initialDocumentUrl = '',
  transactionId,
  checklistLink, // { checklist_id, item_id }: the signed copy lands on that checklist item
  initialSigners = [],
  onCancel,
}) {
  const outlet = useOutletContext() || {};
  const user = userProp || outlet.user;
  const brokerageId = brokerageIdProp || outlet.brokerageId;
  const queryClient = useQueryClient();

  const [step, setStep] = useState('upload');
  const [title, setTitle] = useState(initialTitle);
  const [documentUrl, setDocumentUrl] = useState(initialDocumentUrl);
  const [signers, setSigners] = useState(initialSigners);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [creating, setCreating] = useState(false);

  const [currentDoc, setCurrentDoc] = useState(null);
  const [sequential, setSequential] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    // Name the document after the file unless a title was typed.
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
    setFileName(file.name);

    try {
      // Private: to the deal when sent from one, otherwise to the sender (and admins).
      const response = await base44.integrations.Core.UploadFile({ file, scope: transactionId ? { kind: 'tx', id: transactionId } : { kind: 'user', id: user?.id } });
      const url = response?.file_url || response?.data?.file_url;
      if (url) {
        setDocumentUrl(url);
      } else {
        setError('Upload succeeded but no URL returned');
      }
    } catch (err) {
      setError('Failed to upload document: ' + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const canProceed = () => {
    if (step === 'upload') return title.trim() && documentUrl;
    if (step === 'signers') return signers.length > 0;
    if (step === 'fields') return currentDoc?.fields?.length > 0;
    return true;
  };

  const handleFieldsComplete = async () => {
    // Refetch document to get updated fields
    try {
      const updated = await base44.entities.ESignDocument.get(currentDoc.id);
      setCurrentDoc(updated);
    } catch (err) {
      console.error('Failed to refresh document:', err);
    }
    setStep('send');
  };

  const handleSend = async () => {
    setCreating(true);
    setError(null);

    try {
      const res = await base44.functions.invoke('createESignSubmission', {
        documentId: currentDoc.id,
        documentTitle: currentDoc.title,
        signers: signers.filter(s => s.email),
        sequenceType: sequential ? 'sequential' : 'all_at_once',
        message: message.trim() || undefined,
        transactionId,
        createdByEmail: user.email,
        createdByName: user.full_name,
      });

      await queryClient.invalidateQueries({ queryKey: ['esign-documents', brokerageId] });
      onComplete?.({
        document: currentDoc,
        submissionId: res.data?.submission_id,
        signers: signers.filter((s) => s.email),
      });
    } catch (err) {
      setError('Failed to send: ' + (err.message || err));
    } finally {
      setCreating(false);
    }
  };

  const handleNextStep = async () => {
    if (step === 'upload') {
      setError(null);
      try {
        if (currentDoc) {
          const updated = await base44.entities.ESignDocument.update(currentDoc.id, { title, document_url: documentUrl });
          setCurrentDoc(updated);
          setStep('signers');
          return;
        }
        const doc = await base44.entities.ESignDocument.create({
          brokerage_id: brokerageId,
          title,
          ...(transactionId ? { transaction_id: transactionId } : {}),
          ...(checklistLink ? { checklist_id: checklistLink.checklist_id, checklist_item_id: checklistLink.item_id } : {}),
          document_url: documentUrl,
          fields: [],
          signers: [],
          created_by_email: user.email,
          created_by_name: user.full_name,
        });
        setCurrentDoc(doc);
        setStep('signers');
      } catch (err) {
        setError('Failed to create document: ' + (err.message || err));
      }
    } else if (step === 'signers') {
      // Save signers to document
      try {
        const updated = await base44.entities.ESignDocument.update(currentDoc.id, {
          signers: signers.map(({ id, ...rest }) => rest),
        });
        setCurrentDoc(updated);
        setStep('fields');
      } catch (err) {
        setError('Failed to save signers: ' + (err.message || err));
      }
    } else if (step === 'fields') {
      setStep('send');
    }
  };

  const currentStepIndex = STEPS.findIndex(s => s.id === step);

  const docFields = currentDoc?.fields || [];
  const missingSignature = signers
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.email && !docFields.some((f) => {
      const n = Number(f.signer_index);
      const idx = Number.isInteger(n) && n >= 0 ? n : 0;
      return idx === i && (f.type === 'signature' || f.type === 'initial');
    }))
    .map(({ s }) => s.name || s.email);

  return (
    <div className="space-y-6 py-4">
      {/* Progress Indicator */}
      <div className="flex gap-2">
        {STEPS.map((s, idx) => {
          const StepIcon = s.icon;
          const isActive = s.id === step;
          const isCompleted = idx < currentStepIndex;

          return (
            <motion.button
              key={s.id}
              onClick={() => idx <= currentStepIndex && setStep(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : isCompleted
                  ? 'bg-green-100 text-green-900 border-green-300'
                  : 'bg-muted text-muted-foreground border-border/40'
              } ${idx <= currentStepIndex && 'cursor-pointer hover:bg-primary/90'}`}
              disabled={idx > currentStepIndex}
            >
              <StepIcon className="w-4 h-4" />
              <span className="text-sm font-medium">{s.label}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="space-y-4">
        {/* Step 1: Upload */}
        {step === 'upload' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Document Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Purchase Agreement"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Upload PDF or Image *
              </label>
              <label className="block cursor-pointer">
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <div className="border-2 border-dashed border-border/40 rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  {uploading ? (
                    <>
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" />
                      <p className="text-sm text-muted-foreground">Uploading...</p>
                    </>
                  ) : documentUrl ? (
                    <>
                      <p className="text-sm font-medium text-foreground mb-1">Document uploaded ✓</p>
                      <p className="text-xs text-muted-foreground">{fileName || 'Click to replace it'}</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium text-foreground">Click to upload</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, PNG, or JPG</p>
                    </>
                  )}
                </div>
              </label>
            </div>
          </motion.div>
        )}

        {/* Step 2: Fields */}
        {step === 'fields' && currentDoc && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ESignFieldEditor
              onAutoDetect={isPdfUrl(currentDoc.document_url) ? autoDetectFields : undefined}
              doc={currentDoc}
              onChange={(fields) => setCurrentDoc((d) => (d ? { ...d, fields } : d))}
              onComplete={handleFieldsComplete}
            />
          </motion.div>
        )}

        {/* Step 3: Signers */}
        {step === 'signers' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SignerManagementDashboard
              document={currentDoc}
              submissions={[]}
              onSignersChange={setSigners}
              initialSigners={signers}
            />
          </motion.div>
        )}

        {/* Step 4: Send */}
        {step === 'send' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-foreground">Review Before Sending</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Document</p>
                  <p className="font-medium text-foreground">{currentDoc?.title}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fields</p>
                  <p className="font-medium text-foreground">{currentDoc?.fields?.length || 0} fields placed</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recipients</p>
                  <p className="font-medium text-foreground">{signers.length} signers</p>
                </div>
              </div>
            </div>

            {signers.length > 1 && (
              <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={sequential} onChange={(e) => setSequential(e.target.checked)} />
                <span>
                  <span className="font-medium">Sign in order</span>
                  <span className="block text-muted-foreground text-xs">Each person gets the email only after the one before them signs, in the order listed.</span>
                </span>
              </label>
            )}
            <label className="block text-sm">
              <span className="font-medium">Message to signers (optional)</span>
              <textarea className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" rows={3}
                value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Please review and sign at your earliest convenience." />
            </label>
            {missingSignature.length > 0 ? (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-900">
                {missingSignature.join(', ')} {missingSignature.length === 1 ? 'has' : 'have'} no signature or initials field.
                Go back to Fields and add one, so every signature ends up on the document.
              </div>
            ) : (
              <div className="bg-accent/10 border border-accent rounded-lg p-4">
                <p className="text-sm text-accent-foreground">
                  Ready to send to {signers.length} recipient{signers.length !== 1 ? 's' : ''}. Everyone gets the fully signed PDF by email when the last person signs.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-destructive/10 border border-destructive rounded-lg p-4 flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </motion.div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between gap-3 pt-4 border-t border-border/40">
        <Button
          variant="outline"
          onClick={() => {
            if (step === 'upload') (onCancel ? onCancel() : onComplete?.(null));
            else setStep(STEPS[currentStepIndex - 1].id);
          }}
          disabled={creating}
        >
          {step === 'upload' ? 'Cancel' : 'Back'}
        </Button>

        {step !== 'send' && !canProceed() && !uploading && (
          <p className="text-xs text-muted-foreground self-center ml-auto">
            {step === 'upload' ? (!documentUrl ? 'Upload the document to continue.' : 'Add a title to continue.') : step === 'signers' ? 'Add at least one signer.' : step === 'fields' ? 'Place at least one field.' : ''}
          </p>
        )}
        {step !== 'send' && (
          <Button
            onClick={handleNextStep}
            disabled={!canProceed() || uploading || creating}
            className="gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Next: {STEPS[currentStepIndex + 1]?.label || 'Complete'}
          </Button>
        )}

        {step === 'send' && (
          <Button
            onClick={handleSend}
            disabled={creating || missingSignature.length > 0}
            className="gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send for Signature
          </Button>
        )}
      </div>
    </div>
  );
}