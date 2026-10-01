import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, CheckCircle2, Clock, AlertCircle, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'bg-yellow-500', label: 'Pending' },
  in_progress: { icon: Clock, color: 'bg-blue-500', label: 'In Progress' },
  completed: { icon: CheckCircle2, color: 'bg-green-500', label: 'Completed' },
  declined: { icon: AlertCircle, color: 'bg-red-500', label: 'Declined' },
};

export default function SignerManagementDashboard({ document, submissions = [], onSignersChange, initialSigners = [] }) {
  const [signers, setSigners] = useState(initialSigners.length > 0 ? initialSigners : document?.signers || []);
  const [newSigner, setNewSigner] = useState({ email: '', name: '' });
  const [sequenceType, setSequenceType] = useState('all_at_once');

  // Notify parent when signers change
  useEffect(() => {
    if (onSignersChange) {
      onSignersChange(signers);
    }
  }, [signers, onSignersChange]);

  // Get signer status from submissions
  const getSignerStatus = (signerEmail) => {
    const submission = submissions.find(s => s.document_id === document.id);
    if (!submission) return 'pending';
    
    const signer = submission.signers?.find(s => s.email === signerEmail);
    if (!signer) return 'pending';
    return signer.signed ? 'completed' : 'in_progress';
  };

  const addSigner = () => {
    if (!newSigner.email.trim()) return;
    
    const signer = {
      id: `signer-${Date.now()}`,
      email: newSigner.email,
      name: newSigner.name || newSigner.email,
      order: sequenceType === 'sequential' ? signers.length + 1 : 0,
    };
    
    setSigners([...signers, signer]);
    setNewSigner({ email: '', name: '' });
  };

  const removeSigner = (id) => {
    setSigners(signers.filter(s => s.id !== id));
  };

  const updateSignerOrder = (id, order) => {
    setSigners(signers.map(s => s.id === id ? { ...s, order } : s));
  };

  const updateSigner = (id, field, value) => {
    setSigners(signers.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const updateSequenceType = (type) => {
    setSequenceType(type);
    if (type === 'sequential') {
      setSigners(signers.map((s, idx) => ({ ...s, order: idx + 1 })));
    } else {
      setSigners(signers.map(s => ({ ...s, order: 0 })));
    }
  };

  return (
    <div className="space-y-6">
      {/* Sequence Type Selection */}
      <div>
        <label className="text-sm font-semibold text-foreground block mb-3">Signing Sequence</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => updateSequenceType('all_at_once')}
            className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all font-medium ${
              sequenceType === 'all_at_once'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border/40 text-foreground hover:border-foreground/50'
            }`}
          >
            All at Once
          </button>
          <button
            type="button"
            onClick={() => updateSequenceType('sequential')}
            className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all font-medium ${
              sequenceType === 'sequential'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border/40 text-foreground hover:border-foreground/50'
            }`}
          >
            Sequential
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {sequenceType === 'all_at_once'
            ? 'All signers receive invitations simultaneously'
            : 'Each signer must complete before the next receives an invitation'}
        </p>
      </div>

      {/* Add Signer Form */}
      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
        <label className="text-sm font-semibold text-foreground block">Add Recipient</label>
        <div className="flex flex-col gap-2">
          <Input
            type="email"
            placeholder="Email address"
            value={newSigner.email}
            onChange={(e) => setNewSigner({ ...newSigner, email: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSigner(); } }}
            className="h-9"
          />
          <Input
            placeholder="Name (optional)"
            value={newSigner.name}
            onChange={(e) => setNewSigner({ ...newSigner, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSigner(); } }}
            className="h-9"
          />
          <Button
            type="button"
            onClick={addSigner}
            disabled={!newSigner.email.trim()}
            className="gap-2 h-9 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Add Signer
          </Button>
        </div>
      </div>

      {/* Signers List */}
      <div>
        <label className="text-sm font-semibold text-foreground block mb-3">
          Recipients ({signers.length})
        </label>
        {signers.length === 0 ? (
          <div className="text-center py-8 bg-muted/30 rounded-lg border border-border/40">
            <p className="text-muted-foreground text-sm">No recipients added yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {signers.map((signer, idx) => {
                const status = getSignerStatus(signer.email);
                const statusConfig = STATUS_CONFIG[status];
                const StatusIcon = statusConfig.icon;

                return (
                  <motion.div
                    key={signer.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-card border border-border rounded-lg p-4 flex items-start gap-4"
                  >
                    {/* Order/Drag Handle */}
                    {sequenceType === 'sequential' && (
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted text-muted-foreground flex-shrink-0 mt-0.5">
                        <GripVertical className="w-4 h-4" />
                      </div>
                    )}

                    {/* Signer Info - Editable */}
                    <div className="flex-1 min-w-0 space-y-2">
                      <input
                        type="text"
                        value={signer.name}
                        onChange={(e) => updateSigner(signer.id, 'name', e.target.value)}
                        placeholder="Signer name"
                        className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground placeholder-muted-foreground"
                      />
                      <input
                        type="email"
                        value={signer.email}
                        onChange={(e) => updateSigner(signer.id, 'email', e.target.value)}
                        placeholder="Signer email"
                        className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background text-foreground placeholder-muted-foreground"
                      />
                      {sequenceType === 'sequential' && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-muted-foreground">Order:</label>
                          <input
                            type="number"
                            min="1"
                            max={signers.length}
                            value={signer.order}
                            onChange={(e) => updateSignerOrder(signer.id, parseInt(e.target.value))}
                            className="w-12 px-2 py-1 text-xs border border-border rounded bg-background text-foreground"
                          />
                        </div>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className={`flex items-center gap-1.5 ${statusConfig.color} text-white px-2.5 py-1 rounded-lg`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">{statusConfig.label}</span>
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={() => removeSigner(signer.id)}
                        className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Progress Summary */}
      {signers.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Progress</h3>
          <div className="space-y-2">
            {Object.entries(STATUS_CONFIG).map(([status, config]) => {
              const StatusIcon = config.icon;
              const count = signers.filter(s => getSignerStatus(s.email) === status).length;
              return (
                <div key={status} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`${config.color} text-white p-1 rounded`}>
                      <StatusIcon className="w-3 h-3" />
                    </div>
                    <span className="text-foreground">{config.label}</span>
                  </div>
                  <Badge variant="outline">{count}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}