import React, { useState } from 'react';
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
  initialSigners = [],
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
  const [creating, setCreating] = useState(false);

  const [currentDoc, setCurrentDoc] = useState(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const response = await base44.integrations.Core.UploadFile({ file });
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
        sequenceType: 'all_at_once',
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
        const doc = await base44.entities.ESignDocument.create({
          brokerage_id: brokerageId,
          title,
          ...(transactionId ? { transaction_id: transactionId } : {}),
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
                      <p className="text-xs text-muted-foreground">{documentUrl.split('/').pop()}</p>
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
              doc={currentDoc}
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

            <div className="bg-accent/10 border border-accent rounded-lg p-4">
              <p className="text-sm text-accent-foreground">
                Ready to send signing requests to {signers.length} recipient{signers.length !== 1 ? 's' : ''}?
              </p>
            </div>
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
            if (step === 'upload') onComplete();
            else setStep(STEPS[currentStepIndex - 1].id);
          }}
          disabled={creating}
        >
          {step === 'upload' ? 'Cancel' : 'Back'}
        </Button>

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
            disabled={creating}
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