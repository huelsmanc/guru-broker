import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, CheckCircle, Clock, AlertCircle, Home, FolderOpen, Signature } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  clear_to_close: { label: 'Clear to Close', color: 'bg-green-100 text-green-700 border-green-200' },
  closed: { label: 'Closed', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const ESIGN_STATUS = {
  completed: { label: 'Completed', icon: CheckCircle, color: 'text-green-600' },
  pending: { label: 'Pending Signature', icon: AlertCircle, color: 'text-orange-600' },
  sent: { label: 'Sent for Signature', icon: Clock, color: 'text-blue-600' },
  declined: { label: 'Declined', icon: AlertCircle, color: 'text-red-600' },
};

export default function ClientPortal() {
  const [user, setUser] = useState(null);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [expandedTx, setExpandedTx] = useState(null);

  // Get current user
  useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const u = await base44.auth.me();
      setUser(u);
      return u;
    },
  });

  // Get all transactions
  const { data: allTransactions = [] } = useQuery({
    queryKey: ['transactions-portal'],
    queryFn: () => base44.entities.Transaction.list('-created_date', 200),
    enabled: !!user,
  });

  // Filter transactions where user is a buyer or seller
  const clientTransactions = useMemo(() => {
    if (!user) return [];
    const userFullName = user.full_name;
    return allTransactions.filter(tx => {
      const inBuyers = tx.buyers?.some(b => b.toLowerCase() === userFullName.toLowerCase());
      const inSellers = tx.sellers?.some(s => s.toLowerCase() === userFullName.toLowerCase());
      return inBuyers || inSellers;
    });
  }, [allTransactions, user]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 lg:p-10 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Home className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">My Portal</h1>
        </div>
        <p className="text-muted-foreground">View your documents, transaction status, and approve e-signatures</p>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card className="p-4 border-border/40">
          <p className="text-xs text-muted-foreground mb-1">Active Transactions</p>
          <p className="text-3xl font-bold">{clientTransactions.filter(t => t.status === 'active').length}</p>
        </Card>
        <Card className="p-4 border-border/40">
          <p className="text-xs text-muted-foreground mb-1">Documents Shared</p>
          <p className="text-3xl font-bold">{clientTransactions.reduce((sum, t) => sum + (t.documents?.length || 0), 0)}</p>
        </Card>
        <Card className="p-4 border-border/40">
          <p className="text-xs text-muted-foreground mb-1">Pending Signatures</p>
          <p className="text-3xl font-bold">{clientTransactions.reduce((sum, t) => sum + (t.esign_docs?.filter(d => d.status !== 'completed').length || 0), 0)}</p>
        </Card>
      </div>

      {clientTransactions.length === 0 ? (
        <Card className="p-12 border-border/40 text-center">
          <FolderOpen className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground">No transactions found. Your documents will appear here.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {clientTransactions.map((tx, idx) => {
            const cfg = STATUS_CONFIG[tx.status] || STATUS_CONFIG.active;
            const isExpanded = expandedTx === tx.id;
            const docs = tx.documents || [];
            const esignDocs = tx.esign_docs || [];
            const pendingEsign = esignDocs.filter(d => d.status !== 'completed');

            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-card rounded-xl border border-border/40 overflow-hidden"
              >
                {/* Transaction Header */}
                <div
                  className="p-5 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <p className="font-semibold text-foreground">{tx.property_address}</p>
                        <Badge className={`text-xs border ${cfg.color}`}>{cfg.label}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
                        <span>Agent: {tx.agent_name}</span>
                        {tx.closing_date && <span>Closing: {tx.closing_date}</span>}
                        {tx.sale_price && <span>Price: ${tx.sale_price.toLocaleString()}</span>}
                      </div>
                      {(docs.length > 0 || pendingEsign.length > 0) && (
                        <div className="flex flex-wrap gap-3 text-xs">
                          {docs.length > 0 && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <FileText className="w-3 h-3" /> {docs.length} document{docs.length !== 1 ? 's' : ''}
                            </span>
                          )}
                          {pendingEsign.length > 0 && (
                            <span className="flex items-center gap-1 text-orange-600">
                              <AlertCircle className="w-3 h-3" /> {pendingEsign.length} signature{pendingEsign.length !== 1 ? 's' : ''} pending
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button className="text-muted-foreground hover:text-foreground transition-colors">
                      {isExpanded ? '−' : '+'}
                    </button>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-border/40 p-5 space-y-5">
                    {/* Documents Section */}
                    {docs.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" /> Documents ({docs.length})
                        </p>
                        <div className="space-y-2">
                          {docs.map((doc, i) => (
                            <a
                              key={i}
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 p-3 rounded-lg border border-border/40 hover:bg-muted/30 transition-colors group"
                            >
                              <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                                <p className="text-xs text-muted-foreground">{doc.uploaded_by}</p>
                              </div>
                              <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">Open →</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* E-Signatures Section */}
                    {esignDocs.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                          <Signature className="w-3.5 h-3.5" /> E-Signatures ({esignDocs.length})
                        </p>
                        <div className="space-y-2">
                          {esignDocs.map((doc) => {
                            const cfg = ESIGN_STATUS[doc.status] || ESIGN_STATUS.pending;
                            const Icon = cfg.icon;
                            return (
                              <div
                                key={doc.id}
                                className="p-3 rounded-lg border border-border/40 bg-muted/20"
                              >
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground">{doc.title}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                                      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                                    </div>
                                  </div>
                                  {doc.status === 'pending' && doc.envelope_id && (
                                    <a
                                      href={`/sign?envelope=${doc.envelope_id}`}
                                      className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
                                    >
                                      Sign Now
                                    </a>
                                  )}
                                  {doc.status === 'completed' && (
                                    <span className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium flex-shrink-0">
                                      ✓ Signed
                                    </span>
                                  )}
                                </div>
                                {doc.signers?.length > 0 && (
                                  <div className="text-xs text-muted-foreground mt-2">
                                    {doc.signers.map((s, i) => (
                                      <div key={i} className="ml-5">• {s.name || s.email}</div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {docs.length === 0 && esignDocs.length === 0 && (
                      <p className="text-sm text-muted-foreground italic">No documents or signatures at this time.</p>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}