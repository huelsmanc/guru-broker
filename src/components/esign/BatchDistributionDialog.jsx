import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Mail, FileText, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { isAdminRole, normalizeRole, can } from '../../../shared/permissions.generated.js';

export default function BatchDistributionDialog({ open, onClose, user, brokerageId }) {
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedRecipients, setSelectedRecipients] = useState(new Set());
  const [documentTitle, setDocumentTitle] = useState('');
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  const { data: templates = [] } = useQuery({
    queryKey: ['document-templates', brokerageId],
    queryFn: () => base44.entities.DocumentTemplate.filter({ brokerage_id: brokerageId, is_active: true }, '-created_date', 100),
    enabled: open && !!brokerageId,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['brokerage-users-batch', brokerageId],
    queryFn: async () => {
      const all = await base44.entities.User.list('-created_date', 500);
      return all.filter(u => u.brokerage_id === brokerageId && normalizeRole(u.role) === 'agent' && u.id !== user?.id);
    },
    enabled: open && !!brokerageId && !!user?.id,
  });

  const createBatch = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate || selectedRecipients.size === 0 || !documentTitle) {
        throw new Error('Missing required fields');
      }

      const recipients = Array.from(selectedRecipients);
      let count = 0;

      for (const recipientId of recipients) {
        const recipient = allUsers.find(u => u.id === recipientId);
        if (!recipient) continue;

        // Create document with template fields assigned to this recipient
        const signatureFields = selectedTemplate.signature_fields?.map(field => ({
          ...field,
          signer_email: recipient.email,
          signer_name: recipient.full_name,
          signed: false,
          value: '',
        })) || [];

        await base44.entities.ESignDocument.create({
          brokerage_id: brokerageId,
          title: documentTitle,
          document_url: selectedTemplate.document_url,
          created_by_email: user.email,
          created_by_name: user.full_name,
          signatories: [{
            id: `sig-${Date.now()}`,
            email: recipient.email,
            name: recipient.full_name,
            signed: false,
          }],
          signature_fields: signatureFields,
          status: 'pending',
        });

        // Log activity
        await base44.entities.ActivityLog.create({
          brokerage_id: brokerageId,
          document_id: `batch-${Date.now()}`,
          action_type: 'uploaded',
          user_email: user.email,
          user_name: user.full_name,
          details: `Batch distributed "${documentTitle}" to ${recipient.full_name}`,
        });

        count++;
        setCompletedCount(count);
      }

      return count;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['esign-documents', brokerageId] });
      setCompleted(true);
      setTimeout(() => {
        handleClose();
      }, 2000);
    },
  });

  const toggleRecipient = (userId) => {
    const newSelected = new Set(selectedRecipients);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedRecipients(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRecipients.size === allUsers.length) {
      setSelectedRecipients(new Set());
    } else {
      setSelectedRecipients(new Set(allUsers.map(u => u.id)));
    }
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    setSelectedRecipients(new Set());
    setDocumentTitle('');
    setSending(false);
    setCompleted(false);
    setCompletedCount(0);
    onClose();
  };

  if (completed) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4"
            >
              <Check className="w-6 h-6 text-accent" />
            </motion.div>
            <p className="font-semibold text-foreground">Distribution Complete</p>
            <p className="text-sm text-muted-foreground mt-2">{completedCount} document{completedCount !== 1 ? 's' : ''} sent successfully</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" /> Batch Document Distribution
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Step 1: Select Template */}
          <div>
            <Label className="font-semibold text-base mb-3 block">Step 1: Select Template</Label>
            <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No templates available. Create one in the documents section first.</p>
              ) : (
                templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`p-3 rounded-lg border-2 transition-all text-left ${
                      selectedTemplate?.id === template.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 mt-0.5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground">{template.name}</p>
                        <p className="text-xs text-muted-foreground">{template.description}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedTemplate && (
            <>
              {/* Step 2: Document Title */}
              <div>
                <Label htmlFor="doc-title" className="font-semibold text-base mb-2 block">Step 2: Document Title</Label>
                <Input
                  id="doc-title"
                  value={documentTitle}
                  onChange={(e) => setDocumentTitle(e.target.value)}
                  placeholder="e.g. Q1 2026 Agent Agreements"
                  className="rounded-lg"
                />
              </div>

              {/* Step 3: Select Recipients */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="font-semibold text-base">Step 3: Select Recipients ({selectedRecipients.size})</Label>
                  {allUsers.length > 0 && (
                    <button
                      onClick={toggleSelectAll}
                      className="text-xs text-primary hover:underline"
                    >
                      {selectedRecipients.size === allUsers.length ? 'Deselect All' : 'Select All'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
                  {allUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground col-span-2 py-4">No recipients available.</p>
                  ) : (
                    allUsers.map((u) => (
                      <label
                        key={u.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selectedRecipients.has(u.id)}
                          onCheckedChange={() => toggleRecipient(u.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{u.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Summary */}
              {selectedRecipients.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-accent/5 border border-accent/20 rounded-lg p-4"
                >
                  <p className="text-sm font-medium text-foreground">
                    Ready to distribute <strong>{documentTitle || 'untitled document'}</strong> to {selectedRecipients.size} recipient{selectedRecipients.size !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">Each recipient will receive their own copy with signature fields assigned to them.</p>
                </motion.div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={() => createBatch.mutate()}
            disabled={!selectedTemplate || selectedRecipients.size === 0 || !documentTitle || createBatch.isPending}
            className="gap-2"
          >
            {createBatch.isPending ? (
              <>Distributing...</>
            ) : (
              <><Mail className="w-4 h-4" /> Distribute to {selectedRecipients.size}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}