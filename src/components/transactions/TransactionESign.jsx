import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import DocuSealUploader from '@/components/esign/DocuSealUploader';
import { Send, RefreshCw, FileSignature, Plus, Trash2, ExternalLink, CheckCircle, Clock, AlertCircle, X } from 'lucide-react';

const STATUS_CONFIG = {
  completed: { label: 'Completed', icon: CheckCircle, color: 'bg-green-100 text-green-700 border-green-200' },
  pending: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  sent: { label: 'Sent', icon: Clock, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  declined: { label: 'Declined', icon: AlertCircle, color: 'bg-red-100 text-red-700 border-red-200' },
};

export default function TransactionESign({ tx, isAdmin, user, onUpdate }) {
  const esignDocs = tx.esign_docs || [];

  const [refreshingId, setRefreshingId] = useState(null);
  const [showDocuSealEditor, setShowDocuSealEditor] = useState(false);

  const refreshStatus = async (doc) => {
    if (!doc.envelope_id) return;
    setRefreshingId(doc.id);

    const res = await base44.functions.invoke('docusealGetEnvelope', { envelopeId: doc.envelope_id });
    const envelope = res.data;

    // Map DocuSeal status
    const statusMap = { completed: 'completed', pending: 'pending', sent: 'sent', declined: 'declined' };
    const newStatus = statusMap[envelope.status] || doc.status;

    const updated = esignDocs.map(d =>
      d.id === doc.id ? { ...d, status: newStatus, signers: envelope.signers || d.signers } : d
    );
    await base44.entities.Transaction.update(tx.id, { esign_docs: updated });
    
    // If newly completed, add signed document to transaction documents
    if (newStatus === 'completed' && doc.status !== 'completed') {
      await handleDocumentCompleted({ ...doc, status: newStatus });
    }
    
    setRefreshingId(null);
    onUpdate();
  };

  const removeDoc = async (docId) => {
    const updated = esignDocs.filter(d => d.id !== docId);
    await base44.entities.Transaction.update(tx.id, { esign_docs: updated });
    onUpdate();
  };

  const handleDocumentCompleted = async (doc) => {
    if (doc.status !== 'completed') return;
    
    try {
      // Fetch the signed document PDF from DocuSeal
      const res = await base44.functions.invoke('docusealDownloadDocument', { 
        envelopeId: doc.envelope_id 
      });
      
      if (res.data?.file_url) {
        // Add to transaction documents
        const tx_docs = [...(tx.documents || []), {
          name: `${doc.title} (Signed)`,
          url: res.data.file_url,
          uploaded_at: new Date().toISOString(),
          uploaded_by: 'DocuSeal'
        }];
        await base44.entities.Transaction.update(tx.id, { documents: tx_docs });
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to add signed document:', error);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <FileSignature className="w-3.5 h-3.5" /> E-Signatures
        </p>
        {isAdmin && (
          <button
            onClick={() => setShowDocuSealEditor(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border bg-background border-border/40 hover:bg-muted text-muted-foreground transition-all"
          >
            <FileSignature className="w-3 h-3" /> Create E-Sign Package
          </button>
        )}
      </div>

      {esignDocs.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No documents sent for e-signature yet.</p>
      ) : (
        <div className="space-y-2">
          {esignDocs.map((doc) => {
            const cfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
            const Icon = cfg.icon;
            return (
              <div key={doc.id} className="bg-muted/40 rounded-lg px-3 py-2.5 border border-border/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium text-foreground truncate">{doc.title}</span>
                      <Badge className={`text-[10px] border flex items-center gap-1 ${cfg.color}`}>
                        <Icon className="w-2.5 h-2.5" /> {cfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sent by {doc.sent_by} · {new Date(doc.sent_at).toLocaleDateString()}
                    </p>
                    {doc.signers?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {doc.signers.map((s, i) => (
                          <span key={i} className="text-[11px] bg-background border border-border/40 rounded-md px-1.5 py-0.5 text-muted-foreground">
                            {s.name || s.email}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => refreshStatus(doc)}
                      disabled={refreshingId === doc.id}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                      title="Refresh status"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === doc.id ? 'animate-spin' : ''}`} />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => removeDoc(doc.id)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DocuSeal Editor Modal */}
      {showDocuSealEditor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-xl w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Create E-Sign Package</h2>
              <button
                onClick={() => setShowDocuSealEditor(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  Upload documents below and configure signing fields. Click "Publish" to send for signatures.
                </p>
              </div>
              <DocuSealUploader
                user={user}
                onComplete={() => {
                  setShowDocuSealEditor(false);
                  onUpdate();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}