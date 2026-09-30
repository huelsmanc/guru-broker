import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Send, Loader2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function CustomESignSubmissionManager({ doc, onClose }) {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();

  const [signers, setSigners] = useState([{ email: '', name: '' }]);
  const [sequenceType, setSequenceType] = useState('all_at_once');
  const [error, setError] = useState(null);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const validSigners = signers.filter(s => s.email.trim());
      if (validSigners.length === 0) {
        throw new Error('Please add at least one signer');
      }

      const res = await base44.functions.invoke('createESignSubmission', {
        documentId: doc.id,
        documentTitle: doc.title,
        signers: validSigners,
        sequenceType,
        createdByEmail: user.email,
        createdByName: user.full_name,
      });

      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['esign-submissions'] });
      onClose();
    },
    onError: (err) => {
      setError(err.message || 'Failed to send document');
    },
  });

  const addSigner = () => {
    setSigners([...signers, { email: '', name: '' }]);
  };

  const removeSigner = (idx) => {
    setSigners(signers.filter((_, i) => i !== idx));
  };

  const updateSigner = (idx, field, value) => {
    const updated = [...signers];
    updated[idx][field] = value;
    setSigners(updated);
  };

  return (
    <div className="space-y-6 py-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{doc.title}</h3>
        <img
          src={doc.document_url}
          alt={doc.title}
          className="w-full rounded-lg border border-border/40 max-h-64 object-cover"
        />
      </div>

      <div>
        <Label>Signing Sequence</Label>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => setSequenceType('all_at_once')}
            className={`flex-1 px-3 py-2 rounded-lg border transition-all ${
              sequenceType === 'all_at_once'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border/40 text-foreground hover:bg-muted'
            }`}
          >
            All at Once
          </button>
          <button
            onClick={() => setSequenceType('sequential')}
            className={`flex-1 px-3 py-2 rounded-lg border transition-all ${
              sequenceType === 'sequential'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border/40 text-foreground hover:bg-muted'
            }`}
          >
            Sequential
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {sequenceType === 'all_at_once'
            ? 'All signers receive requests at the same time'
            : 'Each signer completes before the next receives the request'}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <Label>Add Signers</Label>
          <button
            onClick={addSigner}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add Signer
          </button>
        </div>

        <div className="space-y-2">
          <AnimatePresence>
            {signers.map((signer, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex gap-2"
              >
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="Email"
                    value={signer.email}
                    onChange={(e) => updateSigner(idx, 'email', e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="flex-1">
                  <Input
                    placeholder="Name (optional)"
                    value={signer.name}
                    onChange={(e) => updateSigner(idx, 'name', e.target.value)}
                    className="h-9"
                  />
                </div>
                {signers.length > 1 && (
                  <button
                    onClick={() => removeSigner(idx)}
                    className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
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

      <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
        <Button variant="outline" onClick={onClose} disabled={sendMutation.isPending}>
          Cancel
        </Button>
        <Button
          onClick={() => sendMutation.mutate()}
          disabled={!signers.some(s => s.email.trim()) || sendMutation.isPending}
          className="gap-2"
        >
          {sendMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send for Signature
        </Button>
      </div>
    </div>
  );
}