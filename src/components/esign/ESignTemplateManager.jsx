import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Send, Loader2, AlertCircle, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ESignTemplateManager({ templates, onClose }) {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [signers, setSigners] = useState([{ email: '', name: '' }]);
  const [sequenceType, setSequenceType] = useState('all_at_once');
  const [error, setError] = useState(null);

  const deleteTemplate = useMutation({
    mutationFn: async (templateId) => {
      await base44.entities.ESignTemplate.delete(templateId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['esign-templates', brokerageId] }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (signers.some(s => !s.email)) {
        throw new Error('Please fill in all signer emails');
      }

      const res = await base44.functions.invoke('createSubmissionFromTemplate', {
        templateId: selectedTemplate.id,
        signers: signers.filter(s => s.email),
        sequenceType,
      });

      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['esign-submissions'] });
      setShowSubmit(false);
      setSelectedTemplate(null);
      setSigners([{ email: '', name: '' }]);
      onClose?.();
    },
    onError: (err) => {
      setError(err.message || 'Failed to create submission');
    },
  });

  const handleOpenSubmit = (template) => {
    setSelectedTemplate(template);
    setSigners([{ email: '', name: '' }]);
    setSequenceType('all_at_once');
    setError(null);
    setShowSubmit(true);
  };

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
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Templates</h3>
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 h-8 rounded-lg">
            <Plus className="w-3 h-3" /> New Template
          </Button>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-12 rounded-lg border border-dashed border-border/40">
            <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No templates yet. Save a document as a template to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence>
              {templates.map((template, i) => (
                <motion.div
                  key={template.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-muted/50 rounded-lg p-4 border border-border/40 flex items-start justify-between gap-4 hover:bg-muted transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-foreground truncate">{template.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {template.fields?.length || 0} fields • Created by {template.created_by_email}
                    </p>
                  </div>

                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleOpenSubmit(template)}
                      className="gap-1 h-8 text-xs rounded-lg"
                    >
                      <Send className="w-3 h-3" /> Use Template
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteTemplate.mutate(template.id)}
                      disabled={deleteTemplate.isPending}
                      className="h-8 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Submit from template dialog */}
      {selectedTemplate && (
        <Dialog open={showSubmit} onOpenChange={setShowSubmit}>
          <DialogContent className="w-[95vw] max-w-md">
            <DialogHeader>
              <DialogTitle>Use Template: {selectedTemplate.title}</DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
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
                <Button variant="outline" onClick={() => setShowSubmit(false)} disabled={submitMutation.isPending}>
                  Cancel
                </Button>
                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={signers.every(s => !s.email) || submitMutation.isPending}
                  className="gap-2"
                >
                  {submitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send for Signature
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}