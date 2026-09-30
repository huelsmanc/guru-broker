import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FileSignature, Plus, Trash2, Send, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import ESignEditor from '@/components/esign/CustomESignEditor';
import ESignSubmissionManager from '@/components/esign/CustomESignSubmissionManager';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  in_progress: { label: 'In Progress', icon: Clock, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  completed: { label: 'Completed', icon: CheckCircle, color: 'bg-green-100 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', icon: AlertCircle, color: 'bg-red-100 text-red-700 border-red-200' },
};

export default function CustomESign() {
  const { user, brokerageId } = useOutletContext();
  const [showEditor, setShowEditor] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);

  const { data: documents = [] } = useQuery({
    queryKey: ['esign-documents', brokerageId],
    queryFn: () => base44.entities.ESignDocument.filter({ brokerage_id: brokerageId }, '-created_date', 100),
    enabled: !!brokerageId,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['esign-submissions', brokerageId],
    queryFn: () => base44.entities.ESignSubmission.list('-created_date', 100),
    enabled: !!brokerageId,
  });

  const myDocuments = documents.filter(d => d.created_by_email === user?.email);

  const handleDocumentCreated = () => {
    setShowEditor(false);
    setSelectedDoc(null);
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSignature className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">E-Sign</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Create and manage signature requests</p>
            </div>
          </div>
          <Button onClick={() => setShowEditor(true)} className="gap-2 rounded-xl h-10">
            <Plus className="w-4 h-4" /> New Document
          </Button>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium">Documents</button>
        <button className="px-4 py-2 rounded-lg hover:bg-muted text-muted-foreground font-medium">Submissions</button>
      </div>

      {/* My Documents */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Your Documents</h2>
        
        {myDocuments.length === 0 ? (
          <Card className="p-12 border-border/40 text-center">
            <FileSignature className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-muted-foreground">No documents yet. Create one to get started.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myDocuments.map((doc, idx) => {
              const relatedSubmissions = submissions.filter(s => s.document_id === doc.id);
              const completedCount = relatedSubmissions.filter(s => s.status === 'completed').length;

              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <Card className="p-5 border-border/40 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setSelectedDoc(doc)}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground truncate">{doc.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(doc.created_date), 'MMM d, yyyy')}</p>
                      </div>
                      <FileSignature className="w-5 h-5 text-primary flex-shrink-0" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{doc.fields?.length || 0} fields</span>
                      <span>{relatedSubmissions.length} sent</span>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Submissions */}
      <div className="mt-12">
        <h2 className="text-lg font-semibold text-foreground mb-4">Recent Submissions</h2>
        {submissions.filter(s => s.created_by_email === user?.email).slice(0, 5).length === 0 ? (
          <p className="text-muted-foreground text-sm">No submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {submissions.filter(s => s.created_by_email === user?.email).slice(0, 5).map(sub => {
              const cfg = STATUS_CONFIG[sub.status];
              const Icon = cfg?.icon;
              const signedCount = sub.signers?.filter(s => s.signed).length || 0;
              const totalSigners = sub.signers?.length || 0;

              return (
                <Card key={sub.id} className="p-4 border-border/40 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">
                      {documents.find(d => d.id === sub.document_id)?.title || 'Document'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(sub.submitted_at), 'MMM d, h:mm a')} · {signedCount}/{totalSigners} signed
                    </p>
                  </div>
                  <Badge className={`text-xs border ${cfg?.color}`}>
                    {cfg?.label}
                  </Badge>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor Modal */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create E-Sign Document</DialogTitle>
          </DialogHeader>
          <ESignEditor onComplete={handleDocumentCreated} />
        </DialogContent>
      </Dialog>

      {/* Document Detail Modal */}
      {selectedDoc && (
        <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedDoc.title}</DialogTitle>
            </DialogHeader>
            <ESignSubmissionManager doc={selectedDoc} onClose={() => setSelectedDoc(null)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}