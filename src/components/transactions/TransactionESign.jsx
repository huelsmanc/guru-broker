import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import UnifiedESignCreator from '@/components/esign/UnifiedESignCreator';
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
  const [showCreator, setShowCreator] = useState(false);

  // Signing now runs through the built-in e-sign system. Each entry keeps the
  // submission id so its status can be checked; older DocuSeal entries (with an
  // envelope_id) stay listed as they were.
  const STATUS_MAP = { completed: 'completed', in_progress: 'sent', pending: 'sent', declined: 'declined' };

  const refreshStatus = async (doc) => {
    if (!doc.submission_id) return;
    setRefreshingId(doc.id);
    try {
      const sub = await base44.entities.ESignSubmission.get(doc.submission_id);
      const newStatus = STATUS_MAP[sub.status] || doc.status;
      const signers = (sub.signers || []).map((s) => ({ name: s.name, email: s.email, signed: s.signed }));
      const updated = esignDocs.map((d) =>
        d.id === doc.id ? { ...d, status: newStatus, signers: signers.length ? signers : d.signers } : d
      );
      await base44.entities.Transaction.update(tx.id, { esign_docs: updated });
      if (newStatus === 'completed' && doc.status !== 'completed') {
        await handleDocumentCompleted({ ...doc, status: newStatus }, sub);
      }
      onUpdate();
    } catch (error) {
      console.error('Failed to refresh signing status:', error);
    } finally {
      setRefreshingId(null);
    }
  };

  const removeDoc = async (docId) => {
    const updated = esignDocs.filter(d => d.id !== docId);
    await base44.entities.Transaction.update(tx.id, { esign_docs: updated });
    onUpdate();
  };

  const handleDocumentCompleted = async (doc, sub) => {
    const url = sub?.signed_document_url;
    if (!url) return;
    const tx_docs = [...(tx.documents || []), {
      name: `${doc.title} (Signed)`,
      url,
      uploaded_at: new Date().toISOString(),
      uploaded_by: 'E-Sign',
    }];
    await base44.entities.Transaction.update(tx.id, { documents: tx_docs });
  };

  const handleSent = async (result) => {
    if (!result) { setShowCreator(false); return; }
    const { document, submissionId, signers } = result;
    const entry = {
      id: submissionId || document.id,
      submission_id: submissionId,
      esign_document_id: document.id,
      title: document.title,
      status: 'sent',
      signers: (signers || []).map((s) => ({ name: s.name, email: s.email })),
      sent_by: user?.full_name || user?.email,
      sent_at: new Date().toISOString(),
    };
    await base44.entities.Transaction.update(tx.id, { esign_docs: [...esignDocs, entry] });
    setShowCreator(false);
    onUpdate();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <FileSignature className="w-3.5 h-3.5" /> E-Signatures
        </p>
        {isAdmin && (
          <button
            onClick={() => setShowCreator(true)}
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
                    {doc.submission_id && <button
                      onClick={() => refreshStatus(doc)}
                      disabled={refreshingId === doc.id}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                      title="Refresh status"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === doc.id ? 'animate-spin' : ''}`} />
                    </button>}
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

      {showCreator && (
        <Dialog open={showCreator} onOpenChange={setShowCreator}>
          <DialogContent className="w-[96vw] max-w-6xl max-h-[94dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Send for signature</DialogTitle>
            </DialogHeader>
            <UnifiedESignCreator
              user={user}
              brokerageId={tx.brokerage_id}
              transactionId={tx.id}
              initialTitle={tx.property_address ? `${tx.property_address} – ` : ''}
              onComplete={handleSent}
              onCancel={() => setShowCreator(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}