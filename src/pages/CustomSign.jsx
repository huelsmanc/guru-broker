import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { AlertCircle, Loader2, CheckCircle, Signature, Type, PenTool } from 'lucide-react';
import { motion } from 'framer-motion';

const FIELD_TYPES = [
  { id: 'signature', label: 'Signature', icon: Signature },
  { id: 'initial', label: 'Initial', icon: PenTool },
  { id: 'text', label: 'Text', icon: Type },
];

export default function CustomSign() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [submission, setSubmission] = useState(null);
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [activeFieldType, setActiveFieldType] = useState('signature');
  const [signedFields, setSignedFields] = useState({});
  const canvasRefs = useRef({});

  // Fetch submission on mount
  useEffect(() => {
    const fetchSubmission = async () => {
      if (!token) {
        setError('No signing token provided');
        setLoading(false);
        return;
      }

      try {
        // Get all submissions and find by token
        const submissions = await base44.asServiceRole.entities.ESignSubmission.list('-created_date', 1000);
        const found = submissions.find(s => s.signers?.some(sig => sig.token === token));

        if (!found) {
          setError('Invalid or expired signing link');
          setLoading(false);
          return;
        }

        setSubmission(found);

        // Get the document
        const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: found.document_id }, '-created_date', 1);
        if (docs.length) {
          setDocument(docs[0]);
        }
      } catch (err) {
        setError('Failed to load document');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSubmission();
  }, [token]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const ipAddress = await fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => d.ip).catch(() => 'unknown');
      
      const res = await base44.functions.invoke('submitSignature', {
        submissionToken: token,
        signedFields: Object.entries(signedFields).map(([fieldId, value]) => ({
          field_id: fieldId,
          value,
        })),
        ipAddress,
        userAgent: navigator.userAgent,
      });

      return res.data;
    },
    onSuccess: () => {
      setSuccess(true);
    },
    onError: (err) => {
      setError(err.message || 'Failed to submit signature');
    },
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="p-8 border-border/40 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-foreground mb-2">Signing Error</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Return Home
          </Button>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-foreground mb-2">Signature Submitted</h1>
          <p className="text-muted-foreground mb-6">
            Your signature has been recorded successfully. A confirmation email has been sent.
          </p>
          <Button onClick={() => window.location.href = '/'}>Return Home</Button>
        </motion.div>
      </div>
    );
  }

  if (!submission || !document) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  const currentSigner = submission.signers.find(s => s.token === token);

  return (
    <div className="min-h-screen bg-background p-6 lg:p-10">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{document.title}</h1>
          <p className="text-muted-foreground">Please review and sign the document below</p>
        </motion.div>

        {/* Document Preview */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-xl border border-border/40 overflow-hidden mb-8 p-8"
        >
          {document.document_url?.toLowerCase().includes('.pdf') || document.document_url?.includes('application/pdf') ? (
            <object
              data={document.document_url}
              type="application/pdf"
              className="w-full rounded-lg border border-border/40"
              style={{ minHeight: '600px' }}
            >
              <p className="text-muted-foreground text-sm text-center py-8">Unable to preview PDF. <a href={document.document_url} target="_blank" rel="noreferrer" className="text-primary underline">Open in new tab</a></p>
            </object>
          ) : (
            <img src={document.document_url} alt={document.title} className="w-full rounded-lg border border-border/40" />
          )}
        </motion.div>

        {/* Signing Controls */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-xl border border-border/40 p-6 sticky bottom-0 z-50 shadow-lg"
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground mb-2 block">Your Signature</Label>
              <div className="flex gap-2">
                {FIELD_TYPES.map(ft => {
                  const Icon = ft.icon;
                  return (
                    <button
                      key={ft.id}
                      onClick={() => setActiveFieldType(ft.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                        activeFieldType === ft.id
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border/40 text-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{ft.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => window.history.back()}>
                Cancel
              </Button>
              <Button
                onClick={() => submitMutation.mutate()}
                disabled={Object.keys(signedFields).length === 0 || submitMutation.isPending}
                className="gap-2"
              >
                {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Signature className="w-4 h-4" />}
                Submit Signature
              </Button>
            </div>
          </div>

          {submitMutation.error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-destructive/10 border border-destructive rounded-lg p-3 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{submitMutation.error.message}</p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}