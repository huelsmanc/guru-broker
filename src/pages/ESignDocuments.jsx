import React, { useMemo, useState } from 'react';
import SignedDownload from '@/components/esign/SignedDownload';
import { isPdfUrl } from '@/components/esign/PDFPageRenderer';
import { autoDetectFields } from '@/components/esign/autoDetectFields';
import { useOutletContext } from 'react-router-dom';
import MobilePageHeader from '@/components/layout/MobilePageHeader';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Plus, Clock, Eye, Edit2, Trash2, Loader2, ChevronDown, Archive, CheckCircle, ExternalLink, Users, KanbanSquare, Search, X } from 'lucide-react';
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
import ESignBoard from '@/components/esign/ESignBoard.jsx';
import LinkDealPicker from '@/components/esign/LinkDealPicker.jsx';
import { useLiveTable } from '@/hooks/useLiveTable';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

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
  const [activeTab, setActiveTab] = useState('board');
  const isAdmin = isAdminRole(user?.role);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['esign-documents', brokerageId],
    queryFn: async () => {
      return await base44.entities.ESignDocument.filter({ brokerage_id: brokerageId }, '-created_date', 500);
    },
    enabled: !!brokerageId,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['esign-submissions', brokerageId],
    queryFn: async () => {
      return await base44.entities.ESignSubmission.list('-created_date', 500);
    },
    enabled: !!brokerageId,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['esign-templates', brokerageId],
    queryFn: async () => {
      return await base44.entities.ESignTemplate.filter({ brokerage_id: brokerageId }, '-created_date', 300);
    },
    enabled: !!brokerageId,
  });

  // Live: the board and statuses update as signers open and sign.
  useLiveTable('ESignSubmission', () => queryClient.invalidateQueries({ queryKey: ['esign-submissions', brokerageId] }));
  useLiveTable('ESignDocument', () => queryClient.invalidateQueries({ queryKey: ['esign-documents', brokerageId] }));

  // Search: document name, signers (names and emails), the deal's address, who sent it.
  const [search, setSearch] = useState('');
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hay = (...parts) => parts.flat(3).filter((x) => x != null && typeof x !== 'object').join(' ').toLowerCase();
  const shownDocs = useMemo(() => {
    if (!words.length) return documents;
    return documents.filter((d) => {
      const subs = submissions.filter((x) => x.document_id === d.id);
      const text = hay(d.title, d.description, d.property_address, d.created_by_name, d.created_by_email, d.status,
        (d.signers || []).map((x) => [x.name, x.email, x.role]),
        subs.map((x) => (x.signers || []).map((y) => [y.name, y.email])));
      return words.every((w) => text.includes(w));
    });
  }, [documents, submissions, search]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownTemplates = useMemo(() => (words.length
    ? templates.filter((t) => { const text = hay(t.name, t.title, t.description, (t.signers || t.roles || []).map((x) => (typeof x === 'object' ? [x.name, x.role, x.email] : x))); return words.every((w) => text.includes(w)); })
    : templates), [templates, search]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="p-6 lg:p-10 max-w-6xl mx-auto">
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="board" className="gap-2">
              <KanbanSquare className="w-4 h-4" />
              Board
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="w-4 h-4" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <Archive className="w-4 h-4" />
              Templates
            </TabsTrigger>
          </TabsList>

          <div className="relative mt-4">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={activeTab === 'templates' ? 'Search templates' : 'Search by document, signer, email or address'}
              className="pl-9 pr-9 h-10 rounded-xl" aria-label="Search e-sign documents" />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
            )}
          </div>
          {words.length > 0 && activeTab !== 'templates' && (
            <p className="text-xs text-muted-foreground mt-2">{shownDocs.length} of {documents.length} documents match</p>
          )}

          <TabsContent value="board" className="mt-6">
            {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /> : (
              <ESignBoard documents={shownDocs} submissions={submissions} brokerageId={brokerageId}
                canManage={(doc) => doc.created_by_email === user?.email || isAdmin}
                onOpenDraft={(doc) => { setSelectedDoc(doc); setShowFieldEditor(true); }} />
            )}
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            {/* Documents list */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3 animate-spin" />
              <p className="text-muted-foreground">Loading documents...</p>
            </div>
          ) : shownDocs.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-muted-foreground">{documents.length ? 'No documents match your search' : 'No documents yet'}</p>
            </div>
          ) : (
            shownDocs.map((doc, i) => {
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

                  {(isCreator || isAdmin) && <div className="mb-3"><LinkDealPicker doc={doc} brokerageId={brokerageId} /></div>}

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
                    {(() => {
                      const completedSub = submissions.find(s => s.document_id === doc.id && s.status === 'completed' && s.signed_document_url);
                      return completedSub ? <SignedDownload url={completedSub.signed_document_url} className="h-8 rounded-lg border-green-300 text-green-700 hover:bg-green-50" /> : null;
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
              templates={shownTemplates}
              onClose={() => {
                queryClient.invalidateQueries({ queryKey: ['esign-documents', brokerageId] });
              }}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Create document dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="w-[95vw] max-w-[95vw] h-[95dvh] max-h-[95dvh] overflow-y-auto">
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
          <DialogContent className="w-[95vw] max-w-[95vw] h-[95dvh] max-h-[95dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Place Signature Fields</DialogTitle>
            </DialogHeader>
            <ESignFieldEditor
              onAutoDetect={isPdfUrl(selectedDoc.document_url) ? autoDetectFields : undefined}
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
          <DialogContent className="w-[95vw] max-w-[95vw] h-[95dvh] max-h-[95dvh] overflow-y-auto">
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
            <div className="max-h-[70dvh] overflow-y-auto">
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