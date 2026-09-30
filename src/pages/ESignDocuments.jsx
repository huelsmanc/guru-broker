import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import MobilePageHeader from '@/components/layout/MobilePageHeader';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Plus, Clock, Eye, Edit2, Trash2, Loader2, ChevronDown, Archive, CheckCircle, ExternalLink, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import UnifiedESignCreator from '@/components/esign/UnifiedESignCreator.jsx';
import CustomESignSubmissionManager from '@/components/esign/CustomESignSubmissionManager.jsx';
import DocumentViewer from '@/components/esign/DocumentViewer.jsx';
import ESignFieldEditor from '@/components/esign/ESignFieldEditor.jsx';
import ESignActivityLog from '@/components/esign/ESignActivityLog.jsx';
import SigningRequestStatus from '@/components/esign/SigningRequestStatus.jsx';
import ESignTemplateManager from '@/components/esign/ESignTemplateManager.jsx';
import SignerManagementDashboard from '@/components/esign/SignerManagementDashboard.jsx';

export default function ESignDocuments() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const [showEditor, setShowEditor] = useState(false);
  const [showFieldEditor, setShowFieldEditor] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showSignerMgmt, setShowSignerMgmt] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [viewingDocUrl, setViewingDocUrl] = useState(null);
  const [expandedLogs, setExpandedLogs] = useState({});
  const [activeTab, setActiveTab] = useState('documents');
  const isAdmin = user?.role === 'admin';

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['esign-documents', brokerageId],
    queryFn: async () => {
      return await base44.entities.ESignDocument.filter({ brokerage_id: brokerageId }, '-created_date', 100);
    },
    enabled: !!brokerageId,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['esign-submissions', brokerageId],
    queryFn: async () => {
      return await base44.entities.ESignSubmission.list('-created_date', 200);
    },
    enabled: !!brokerageId,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['esign-templates', brokerageId],
    queryFn: async () => {
      return await base44.entities.ESignTemplate.filter({ brokerage_id: brokerageId }, '-created_date', 100);
    },
    enabled: !!brokerageId,
  });

  const deleteDoc = useMutation({
    mutationFn: async (doc) => {
      await base44.entities.ESignDocument.delete(doc.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['esign-documents', brokerageId] }),
  });

  const handleOpenSubmit = (doc) => {
    setSelectedDoc(doc);
    setShowSubmit(true);
  };

  const handleCloseSubmit = () => {
    setShowSubmit(false);
    setSelectedDoc(null);
  };

  return (
    <>
      <MobilePageHeader title="E-Sign" />
      <div className="p-6 lg:p-10 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <FileText className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground">E-Sign Documents</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Create and send documents for secure signing</p>
            </div>
          </div>
          <Button onClick={() => setShowEditor(true)} className="gap-2 rounded-xl h-11">
            <Plus className="w-4 h-4" /> New Document
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="w-4 h-4" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <Archive className="w-4 h-4" />
              Templates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="mt-6">
            {/* Documents list */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3 animate-spin" />
              <p className="text-muted-foreground">Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground">No documents yet</p>
            </div>
          ) : (
            documents.map((doc, i) => {
              const isCreator = doc.created_by_email === user?.email;

              return (
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{doc.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {doc.created_by_name} • {format(new Date(doc.created_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-3 py-1.5 rounded-lg">
                        <FileText className="w-4 h-4" /> {doc.fields?.length || 0} fields
                      </span>
                    </div>
                  </div>

                  {/* Signing requests: who has signed, resend, cancel, signed PDF */}
                  {submissions.filter(s => s.document_id === doc.id).length > 0 && (
                    <div className="mb-3 space-y-2">
                      {submissions.filter(s => s.document_id === doc.id).map(sub => (
                        <SigningRequestStatus key={sub.id} sub={sub} canManage={isCreator || isAdmin} />
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 rounded-lg text-xs h-8"
                      onClick={() => setViewingDocUrl(doc.document_url)}
                    >
                      <Eye className="w-3 h-3" /> View
                    </Button>
                    {(() => {
                      const completedSub = submissions.find(s => s.document_id === doc.id && s.status === 'completed' && s.signed_document_url);
                      return completedSub ? (
                        <a href={completedSub.signed_document_url} target="_blank" rel="noreferrer">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 rounded-lg text-xs h-8 border-green-300 text-green-700 hover:bg-green-50"
                          >
                            <CheckCircle className="w-3 h-3" /> View Signed Document
                          </Button>
                        </a>
                      ) : null;
                    })()}
                    {(isCreator || isAdmin) && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 rounded-lg text-xs h-8"
                        onClick={() => {
                          setSelectedDoc(doc);
                          setShowFieldEditor(true);
                        }}
                      >
                        <Edit2 className="w-3 h-3" /> Edit Document
                      </Button>
                    )}
                    {(isCreator || isAdmin) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-lg text-destructive hover:bg-destructive/10"
                        onClick={() => deleteDoc.mutate(doc)}
                        disabled={deleteDoc.isPending}
                      >
                        {deleteDoc.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-muted-foreground hover:bg-muted ml-auto"
                      onClick={() => setExpandedLogs(prev => ({
                        ...prev,
                        [doc.id]: !prev[doc.id]
                      }))}
                    >
                      <Clock className="w-3 h-3 mr-1.5" />
                      Activity
                      <ChevronDown className={`w-3 h-3 ml-1 transition-transform ${expandedLogs[doc.id] ? 'rotate-180' : ''}`} />
                    </Button>
                  </div>

                  {/* Activity Log */}
                  {expandedLogs[doc.id] && (
                    <div className="mt-4 pt-4 border-t border-border/40">
                      <ESignActivityLog documentId={doc.id} />
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
          </div>
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <ESignTemplateManager
              templates={templates}
              onClose={() => {
                queryClient.invalidateQueries({ queryKey: ['esign-documents', brokerageId] });
              }}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Create document dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create & Send E-Sign Document</DialogTitle>
          </DialogHeader>
          <UnifiedESignCreator onComplete={() => {
            setShowEditor(false);
          }} />
        </DialogContent>
      </Dialog>

      {/* Field Editor dialog */}
      {selectedDoc && (
        <Dialog open={showFieldEditor} onOpenChange={setShowFieldEditor}>
          <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Place Signature Fields</DialogTitle>
            </DialogHeader>
            <ESignFieldEditor
              doc={selectedDoc}
              onComplete={() => {
                setShowFieldEditor(false);
                queryClient.invalidateQueries({ queryKey: ['esign-documents', brokerageId] });
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Send for signature dialog */}
      {selectedDoc && (
        <Dialog open={showSubmit} onOpenChange={handleCloseSubmit}>
          <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Send for Signature</DialogTitle>
            </DialogHeader>
            <CustomESignSubmissionManager doc={selectedDoc} onClose={handleCloseSubmit} />
          </DialogContent>
        </Dialog>
      )}

      {/* Signer Management dialog */}
      {selectedDoc && (
        <Dialog open={showSignerMgmt} onOpenChange={setShowSignerMgmt}>
          <DialogContent className="w-[95vw] max-w-md">
            <DialogHeader>
              <DialogTitle>Manage Signers: {selectedDoc.title}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto">
              <SignerManagementDashboard
                document={selectedDoc}
                submissions={[]}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Document viewer */}
      {viewingDocUrl && (
        <DocumentViewer
          documentUrl={viewingDocUrl}
          onClose={() => setViewingDocUrl(null)}
        />
      )}
    </>
  );
}