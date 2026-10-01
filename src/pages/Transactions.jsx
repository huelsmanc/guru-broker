import React, { useState, useMemo, useEffect } from 'react';
import { useOutletContext, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, ClipboardList, User, Calendar, DollarSign, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Search, Paperclip, Upload, FileText, Trash2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import TransactionESign from '@/components/transactions/TransactionESign';
import CommissionBreakdown from '@/components/transactions/CommissionBreakdown';
import ClosingReviewPrompt from '@/components/transactions/ClosingReviewPrompt';
import ScanContractButton from '@/components/transactions/ScanContractButton';
import FileCheck from '@/components/transactions/FileCheck';
import ContactPicker from '@/components/contacts/ContactPicker';
import { saveToContactBook } from '@/lib/contacts';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';


const MILESTONES = [
  'Under Contract',
  'Inspection Scheduled',
  'Inspection Complete',
  'Appraisal Ordered',
  'Appraisal Complete',
  'Title Ordered',
  'Loan Approval',
  'Clear to Close',
  'Closed',
];

const STATUS_CONFIG = {
  active: { label: 'Active', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  clear_to_close: { label: 'Clear to Close', color: 'bg-green-100 text-green-700 border-green-200' },
  closed: { label: 'Closed', color: 'bg-slate-100 text-slate-600 border-slate-200' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700 border-red-200' },
};

const FLAG_CONFIG = {
  none: null,
  action_needed: { label: 'Action Needed', icon: AlertCircle, color: 'text-orange-500' },
  resolved: { label: 'Resolved', icon: CheckCircle, color: 'text-green-500' },
};

const KEY_DATE_DISPLAY = [
  { field: 'inspection_date', label: 'Inspection', emoji: '🔍', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { field: 'appraisal_date', label: 'Appraisal', emoji: '📊', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { field: 'financing_contingency_date', label: 'Financing Contingency', emoji: '💰', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { field: 'inspection_contingency_date', label: 'Inspection Contingency', emoji: '📋', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { field: 'loan_approval_date', label: 'Loan Approval', emoji: '🏦', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  { field: 'title_deadline_date', label: 'Title Deadline', emoji: '📝', color: 'bg-green-50 text-green-700 border-green-200' },
];

const EMPTY_FORM = {
  property_address: '', agent_email: '', agent_name: '',
  tc_email: '', tc_name: '',
  buyers: [''], sellers: [''], sale_price: '',
  closing_date: '',
  inspection_date: '', appraisal_date: '',
  financing_contingency_date: '', inspection_contingency_date: '',
  loan_approval_date: '', title_deadline_date: '',
  transaction_type: 'purchase', status: 'active',
};

export default function Transactions() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role);
  const isClosedOrCancelled = (tx) => tx.status === 'closed' || tx.status === 'cancelled';
  const canEditTx = (tx) => (isAdmin || tx.agent_email === user?.email) && !isClosedOrCancelled(tx);

  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [showUpdate, setShowUpdate] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [form, setForm] = useState(EMPTY_FORM);
  const [updateForm, setUpdateForm] = useState({ message: '', milestone: '', flag: 'none' });
  const [uploadingFor, setUploadingFor] = useState(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  // Links like /Transactions?open=<id> (from "Offer accepted" and TC emails) open that file.
  useEffect(() => {
    const id = searchParams.get('open');
    if (id) navigate(`/Transactions/${id}`, { replace: true });
  }, [searchParams, navigate]);

  // Fill the new-file form from an AI contract scan.
  const applyScan = (r, files) => {
    const d = r.dates || {};
    setForm((f) => ({
      ...f,
      property_address: [r.property_address, r.city, r.state, r.zip].filter(Boolean).join(', ') || f.property_address,
      buyers: r.buyers?.length ? r.buyers : f.buyers,
      sellers: r.sellers?.length ? r.sellers : f.sellers,
      sale_price: r.purchase_price ?? f.sale_price,
      closing_date: d.closing_date || f.closing_date,
      inspection_date: d.inspection_date || f.inspection_date,
      appraisal_date: d.appraisal_date || f.appraisal_date,
      financing_contingency_date: d.financing_contingency_date || f.financing_contingency_date,
      inspection_contingency_date: d.inspection_contingency_date || f.inspection_contingency_date,
      loan_approval_date: d.loan_approval_date || f.loan_approval_date,
      title_deadline_date: d.title_deadline_date || f.title_deadline_date,
      documents: files.map((x) => ({ name: x.name, url: x.url, uploaded_at: new Date().toISOString(), uploaded_by: user?.full_name })),
      scan_issues: r.issues || [],
    }));
  };
  const [editingDate, setEditingDate] = useState(null); // { txId, field }
  const [editingTx, setEditingTx] = useState(null); // full transaction being edited
  const [closingPromptTx, setClosingPromptTx] = useState(null); // tx to show closing review prompt for
  const [expandCommission, setExpandCommission] = useState({}); // track expanded commission sections by tx id
  const [expandDocuments, setExpandDocuments] = useState({}); // track expanded document sections by tx id
  const [expandUpdates, setExpandUpdates] = useState({}); // track expanded update sections by tx id

  const { data: brokerageUsers = [] } = useQuery({
    queryKey: ['brokerage-users-tx', brokerageId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getBrokerageUsers', {});
      return res.data?.users || [];
    },
    enabled: !!brokerageId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions', brokerageId, user?.email],
    // Security rules decide what comes back: your own deals, deals you're a co-agent or TC on,
    // your team's (team leaders) or everything (admins).
    queryFn: () => base44.entities.Transaction.filter({ brokerage_id: brokerageId }, '-created_date', 500),
    enabled: !!brokerageId && !!user,
  });

  const { data: checklistsByTx = {} } = useQuery({
    queryKey: ['tx-checklist-progress', brokerageId],
    queryFn: async () => {
      const rows = await base44.entities.Checklist.filter({ brokerage_id: brokerageId, subject_type: 'transaction' }, '-created_date', 2000);
      return rows.reduce((m, c) => ({ ...m, [c.subject_id]: [...(m[c.subject_id] || []), c] }), {});
    },
    enabled: !!brokerageId && !!user,
  });

  const createTransaction = useMutation({
    mutationFn: async ({ picked = [], ...data }) => {
      const tx = await base44.entities.Transaction.create({
        ...data,
        brokerage_id: brokerageId,
        sale_price: data.sale_price ? parseFloat(data.sale_price) : null,
        buyers: data.buyers.filter(b => b.trim()),
        sellers: data.sellers.filter(s => s.trim()),
        updates: [],
      });
      // Buyers/sellers picked from the contact book go on the deal's contacts, linked back.
      const names = new Set([...data.buyers, ...data.sellers].map((n) => n.trim().toLowerCase()));
      for (const p of picked.filter((x) => names.has(String(x.contact.name || '').trim().toLowerCase()))) {
        await base44.entities.TransactionContact.create({
          transaction_id: tx.id, brokerage_id: tx.brokerage_id || brokerageId, agent_email: String(tx.agent_email || user.email).toLowerCase(),
          name: p.contact.name, email: p.contact.email || null, phone: p.contact.phone || null, company: p.contact.company || null,
          role: p.role, is_client: true, contact_id: p.contact.id,
        }).catch(() => {});
      }
      // Typed-in buyers/sellers become contacts too, so they're there next time.
      const pickedNames = new Set(picked.map((p) => String(p.contact.name || '').trim().toLowerCase()));
      for (const [list, type] of [[data.buyers, 'buyer'], [data.sellers, 'seller']]) {
        for (const n of list.map((x) => x.trim()).filter(Boolean)) if (!pickedNames.has(n.toLowerCase())) saveToContactBook(user, { name: n, type, source: 'deal' }).catch(() => {});
      }
      return tx;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
    },
  });

  const addUpdate = useMutation({
    mutationFn: async ({ transactionId, update }) => {
      const tx = transactions.find(t => t.id === transactionId);
      const newUpdates = [...(tx.updates || []), {
        id: Date.now().toString(),
        ...update,
        posted_by: user.full_name,
        posted_at: new Date().toISOString(),
      }];
      const isClosingMilestone = update.milestone === 'Closed';
      const statusUpdate = update.milestone === 'Clear to Close' ? { status: 'clear_to_close' }
        : isClosingMilestone ? { status: 'closed' } : {};
      await base44.entities.Transaction.update(transactionId, { updates: newUpdates, ...statusUpdate });
      base44.functions.invoke('notifyTransactionActivity', {
        type: 'update_posted',
        transaction: tx,
        actor: { email: user.email, full_name: user.full_name, updateMessage: update.message },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] });
      if (variables.update.milestone === 'Closed') {
        const tx = transactions.find(t => t.id === variables.transactionId);
        if (tx) setClosingPromptTx(tx);
      }
      setShowUpdate(null);
      setUpdateForm({ message: '', milestone: '', flag: 'none' });
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status, tx }) => base44.entities.Transaction.update(id, { status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] });
      if (variables.status === 'closed' && variables.tx) {
        setClosingPromptTx(variables.tx);
      }
    },
  });

  const uploadFile = async (txId, file) => {
    setUploadingFor(txId);
    const { file_url } = await base44.integrations.Core.UploadFile({ file, scope: { kind: 'tx', id: txId } });
    const tx = transactions.find(t => t.id === txId);
    const docs = [...(tx.documents || []), { name: file.name, url: file_url, uploaded_at: new Date().toISOString(), uploaded_by: user.full_name }];
    await base44.entities.Transaction.update(txId, { documents: docs });
    base44.functions.invoke('notifyTransactionActivity', {
      type: 'file_uploaded',
      transaction: tx,
      actor: { email: user.email, full_name: user.full_name, fileName: file.name },
    });
    queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] });
    setUploadingFor(null);
  };

  const saveEditTx = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Transaction.update(id, {
      ...data,
      sale_price: data.sale_price ? parseFloat(data.sale_price) : null,
      buyers: data.buyers.filter(b => b.trim()),
      sellers: data.sellers.filter(s => s.trim()),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] });
      setEditingTx(null);
    },
  });

  const updateKeyDate = async (txId, field, value) => {
    await base44.entities.Transaction.update(txId, { [field]: value });
    queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] });
    setEditingDate(null);
  };

  const toggleDateCompleted = async (txId, field) => {
    const tx = transactions.find(t => t.id === txId);
    const completed = tx.completed_dates || [];
    const updated = completed.includes(field)
      ? completed.filter(f => f !== field)
      : [...completed, field];
    await base44.entities.Transaction.update(txId, { completed_dates: updated });
    queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] });
  };

  const deleteDoc = async (txId, docIndex) => {
    const tx = transactions.find(t => t.id === txId);
    const docs = tx.documents.filter((_, i) => i !== docIndex);
    await base44.entities.Transaction.update(txId, { documents: docs });
    queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] });
  };

  const filtered = useMemo(() => transactions.filter(tx => {
    const matchSearch = !search || tx.property_address?.toLowerCase().includes(search.toLowerCase()) ||
      tx.agent_name?.toLowerCase().includes(search.toLowerCase()) ||
      (tx.buyers?.join(' ') || tx.buyer_name || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || tx.status === statusFilter;
    return matchSearch && matchStatus;
  }), [transactions, search, statusFilter]);

  const handleAgentSelect = (email) => {
    const agent = brokerageUsers.find(u => u.email === email);
    setForm(f => ({ ...f, agent_email: email, agent_name: agent?.display_name || agent?.full_name || '' }));
  };

  const handleTCSelect = (email) => {
    const tc = brokerageUsers.find(u => u.email === email);
    setForm(f => ({ ...f, tc_email: email, tc_name: tc?.display_name || tc?.full_name || '' }));
  };

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Track files and milestones across your team</p>
            </div>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreate(true)} className="gap-2 rounded-xl h-10">
              <Plus className="w-4 h-4" /> New File
            </Button>
          )}
        </div>
      </motion.div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 border border-border/40 flex-1 min-w-48">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search address, agent, buyer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent outline-none text-sm w-full placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['all', 'active', 'clear_to_close', 'closed', 'cancelled'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border/40 text-muted-foreground hover:bg-muted'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {['active', 'clear_to_close', 'closed', 'cancelled'].map(s => (
          <Card key={s} className="p-4 border-border/40">
            <p className="text-xs text-muted-foreground">{STATUS_CONFIG[s].label}</p>
            <p className="text-2xl font-bold mt-1">{transactions.filter(t => t.status === s).length}</p>
          </Card>
        ))}
      </div>

      {/* Transaction List */}
      {filtered.length === 0 ? (
        <Card className="p-12 border-border/40 text-center">
          <ClipboardList className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground">{transactions.length === 0 ? 'No transactions yet' : 'No transactions match your filters'}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((tx, idx) => {
            const isExpanded = expandedId === tx.id;
            const lastUpdate = tx.updates?.[tx.updates.length - 1];
            const hasActionNeeded = tx.updates?.some(u => u.flag === 'action_needed');
            const cfg = STATUS_CONFIG[tx.status] || STATUS_CONFIG.active;
            const checklist = (checklistsByTx[tx.id] || []).flatMap((l) => l.items || []);
            const checklistDone = checklist.filter((t) => ['approved', 'exempt', 'done'].includes(t.status)).length;
            const checklistTotal = checklist.length;
            const buyerDisplay = tx.buyers?.filter(Boolean).join(', ') || tx.buyer_name;
            const hasKeyDates = KEY_DATE_DISPLAY.some(kd => tx[kd.field]);

            const isClosed = isClosedOrCancelled(tx);

            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className={`bg-card rounded-2xl border border-border/40 overflow-hidden ${!isAdmin && isClosed ? 'opacity-60' : ''}`}
              >
                {/* Header Row */}
                <div
                  className="p-5 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Link to={`/Transactions/${tx.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-foreground hover:underline">{tx.property_address}</Link>
                        <Link to={`/Transactions/${tx.id}`} onClick={(e) => e.stopPropagation()} className="text-xs rounded-md border px-2 py-0.5 text-primary hover:bg-primary/10">Open file</Link>
                        <Badge className={`text-xs border ${cfg.color}`}>{cfg.label}</Badge>
                        {hasActionNeeded && (
                          <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">⚠ Action Needed</Badge>
                        )}
                        {checklistTotal > 0 && (
                          <Badge className={`text-xs border ${checklistDone === checklistTotal ? 'bg-green-100 text-green-700 border-green-200' : 'bg-muted text-muted-foreground border-border/40'}`}>
                            ✓ {checklistDone}/{checklistTotal}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" /> Agent: {tx.agent_name}</span>
                        {tx.tc_name && <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" /> TC: {tx.tc_name}</span>}
                        {buyerDisplay && <span>Buyer: {buyerDisplay}</span>}
                        {tx.closing_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Close: {tx.closing_date}</span>}
                        {tx.sale_price && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${tx.sale_price.toLocaleString()}</span>}
                      </div>
                      {lastUpdate && (
                        <p className="text-xs text-muted-foreground mt-1.5 italic truncate">
                          Latest: {lastUpdate.milestone ? `[${lastUpdate.milestone}] ` : ''}{lastUpdate.message}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isClosed && isAdmin && (
                        <button
                          onClick={e => { e.stopPropagation(); updateStatus.mutate({ id: tx.id, status: 'active' }); }}
                          className="px-3 py-1.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-200 transition-colors"
                        >
                          ↩ Reopen
                        </button>
                      )}
                      {!isClosed && (isAdmin || tx.agent_email === user?.email) && (
                        <button
                          onClick={e => { e.stopPropagation(); setShowUpdate(tx.id); }}
                          className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
                        >
                          + Update
                        </button>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Detail */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden border-t border-border/40"
                    >
                      <div className="p-5 space-y-5">

                        {/* Closed/Cancelled notice for agents */}
                        {isClosed && !isAdmin && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-500 text-center">
                            This transaction is <strong>{STATUS_CONFIG[tx.status]?.label}</strong> and is read-only. Contact your admin to reopen it.
                          </div>
                        )}

                        {/* Key Dates */}
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" /> Key Dates
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {KEY_DATE_DISPLAY.map(kd => {
                              const isEditing = editingDate?.txId === tx.id && editingDate?.field === kd.field;
                              const isDone = (tx.completed_dates || []).includes(kd.field);
                              return (
                                <div key={kd.field} className="relative">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1 bg-white border border-border rounded-md shadow-md px-2 py-1 z-10">
                                      <span className="text-xs">{kd.emoji} {kd.label}:</span>
                                      <input
                                        type="date"
                                        autoFocus
                                        defaultValue={tx[kd.field] || ''}
                                        className="text-xs border-none outline-none bg-transparent"
                                        onChange={e => e.target.value && updateKeyDate(tx.id, kd.field, e.target.value)}
                                        onBlur={e => { if (!e.target.value) setEditingDate(null); }}
                                        onKeyDown={e => e.key === 'Escape' && setEditingDate(null)}
                                      />
                                      <button onClick={() => setEditingDate(null)} className="text-muted-foreground hover:text-foreground text-xs ml-1">✕</button>
                                    </div>
                                  ) : tx[kd.field] ? (
                                    <div className={`flex items-center gap-1 text-xs border rounded-md px-2 py-1 transition-all ${isDone ? 'bg-green-50 text-green-700 border-green-300 opacity-70' : kd.color}`}>
                                      <button
                                        onClick={() => canEditTx(tx) && setEditingDate({ txId: tx.id, field: kd.field })}
                                        className={`flex items-center gap-1 ${canEditTx(tx) ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
                                        title={canEditTx(tx) ? 'Click to edit date' : undefined}
                                      >
                                        {isDone ? '✅' : kd.emoji} {isDone ? <s>{kd.label}: {tx[kd.field]}</s> : `${kd.label}: ${tx[kd.field]}`}
                                      </button>
                                      {canEditTx(tx) && (
                                        <button
                                          onClick={() => toggleDateCompleted(tx.id, kd.field)}
                                          className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-all ${isDone ? 'bg-green-200 text-green-800 border-green-300 hover:bg-green-100' : 'bg-white/60 text-muted-foreground border-current/30 hover:bg-white'}`}
                                          title={isDone ? 'Mark as not done' : 'Mark as done'}
                                        >
                                          {isDone ? 'Undo' : 'Done'}
                                        </button>
                                      )}
                                    </div>
                                  ) : canEditTx(tx) ? (
                                    <button
                                      onClick={() => setEditingDate({ txId: tx.id, field: kd.field })}
                                      className="text-xs border border-dashed rounded-md px-2 py-1 border-border/50 text-muted-foreground hover:bg-muted transition-all"
                                    >
                                      {kd.emoji} + {kd.label}
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Edit / controls row */}
                        {canEditTx(tx) && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => setEditingTx({ ...tx, sale_price: tx.sale_price ?? '', buyers: tx.buyers?.length ? tx.buyers : [tx.buyer_name || ''], sellers: tx.sellers?.length ? tx.sellers : [tx.seller_name || ''] })}
                              className="px-3 py-1.5 bg-muted border border-border/40 text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors"
                            >
                              ✏ Edit Transaction
                            </button>
                          </div>
                        )}

                        {/* Status controls for admin */}
                        {isAdmin && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs text-muted-foreground font-medium">Change status:</p>
                            {Object.entries(STATUS_CONFIG).map(([key, val]) => (
                             <button
                               key={key}
                               onClick={() => updateStatus.mutate({ id: tx.id, status: key, tx })}
                               className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${tx.status === key ? `${val.color} font-semibold` : 'bg-background border-border/40 text-muted-foreground hover:bg-muted'} ${key === 'cancelled' && tx.status !== 'cancelled' ? 'hover:bg-red-50 hover:text-red-600 hover:border-red-200' : ''}`}
                             >
                               {key === 'cancelled' ? '🚫 Cancel' : val.label}
                             </button>
                            ))}
                          </div>
                        )}

                        {/* Commission (Collapsible) */}
                        <div>
                          <button
                            onClick={() => setExpandCommission(s => ({ ...s, [tx.id]: !s[tx.id] }))}
                            className="w-full flex items-center justify-between mb-3 p-3 hover:bg-muted/30 rounded-lg border border-border/40 transition-colors"
                          >
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                              <DollarSign className="w-3.5 h-3.5" /> Commission Tracking
                            </p>
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandCommission[tx.id] ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {expandCommission[tx.id] && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden mb-5"
                              >
                                <CommissionBreakdown
                                  tx={tx}
                                  isAdmin={isAdmin}
                                  onUpdate={() => queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] })}
                                />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* AI file check */}
                        <FileCheck
                          tx={tx}
                          canEdit={canEditTx(tx)}
                          onUpdate={() => queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] })}
                        />

                        {/* Checklist */}
                        <Link to={`/Transactions/${tx.id}?tab=checklists`} className="block rounded-xl border p-3 hover:bg-muted/40">
                          <div className="flex justify-between text-sm"><span className="font-medium">Checklists</span><span className="text-muted-foreground">{checklistTotal ? `${checklistDone} of ${checklistTotal} complete` : 'None yet - add one'}</span></div>
                          {checklistTotal > 0 && <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.round((checklistDone / checklistTotal) * 100)}%` }} /></div>}
                        </Link>

                        {/* E-Signatures */}
                        <TransactionESign
                          tx={tx}
                          isAdmin={isAdmin}
                          user={user}
                          onUpdate={() => queryClient.invalidateQueries({ queryKey: ['transactions', brokerageId] })}
                        />

                        {/* Documents (Collapsible) */}
                        <div>
                          <button
                            onClick={() => setExpandDocuments(s => ({ ...s, [tx.id]: !s[tx.id] }))}
                            className="w-full flex items-center justify-between mb-3 p-3 hover:bg-muted/30 rounded-lg border border-border/40 transition-colors"
                          >
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                              <Paperclip className="w-3.5 h-3.5" /> Documents
                            </p>
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandDocuments[tx.id] ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {expandDocuments[tx.id] && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden mb-5"
                              >
                                <div className="space-y-2">
                                  <div className="flex items-center justify-end mb-2">
                                    <label className="cursor-pointer">
                                      <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadFile(tx.id, e.target.files[0]); e.target.value = ''; }} />
                                      <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${uploadingFor === tx.id ? 'opacity-50 pointer-events-none' : 'bg-background border-border/40 hover:bg-muted text-muted-foreground'}`}>
                                        <Upload className="w-3 h-3" /> {uploadingFor === tx.id ? 'Uploading...' : 'Upload'}
                                      </span>
                                    </label>
                                  </div>
                                  {tx.documents?.length > 0 ? (
                                    <div className="space-y-1.5">
                                      {tx.documents.map((doc, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 border border-border/30">
                                          <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                                          <span className="text-sm text-foreground flex-1 truncate">{doc.name}</span>
                                          <span className="text-xs text-muted-foreground flex-shrink-0">{doc.uploaded_by}</span>
                                          <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                                            <ExternalLink className="w-3.5 h-3.5" />
                                          </a>
                                          {isAdmin && (
                                            <button onClick={() => deleteDoc(tx.id, i)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground italic">No documents uploaded yet.</p>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Updates (Collapsible) */}
                        {tx.updates?.length > 0 && (
                          <div>
                            <button
                              onClick={() => setExpandUpdates(s => ({ ...s, [tx.id]: !s[tx.id] }))}
                              className="w-full flex items-center justify-between mb-3 p-3 hover:bg-muted/30 rounded-lg border border-border/40 transition-colors"
                            >
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                Updates ({tx.updates.length})
                              </p>
                              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expandUpdates[tx.id] ? 'rotate-180' : ''}`} />
                            </button>
                            <AnimatePresence>
                              {expandUpdates[tx.id] && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden mb-5 space-y-3"
                                >
                                  {[...tx.updates].reverse().map((update, i) => {
                                    const flagCfg = FLAG_CONFIG[update.flag];
                                    return (
                                      <div key={update.id || i} className="flex gap-3">
                                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                            {update.milestone && (
                                              <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{update.milestone}</span>
                                            )}
                                            {flagCfg && (
                                              <span className={`flex items-center gap-1 text-xs font-medium ${flagCfg.color}`}>
                                                <flagCfg.icon className="w-3 h-3" /> {flagCfg.label}
                                              </span>
                                            )}
                                            <span className="text-xs text-muted-foreground ml-auto">
                                              {update.posted_by} · {format(new Date(update.posted_at), 'MMM d, h:mm a')}
                                            </span>
                                          </div>
                                          <p className="text-sm text-foreground">{update.message}</p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create Transaction Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Transaction File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <ScanContractButton scope={{ kind: 'user', id: user?.id }} onResult={applyScan} />
            <div>
              <Label>Property Address *</Label>
              <Input value={form.property_address} onChange={e => setForm(f => ({ ...f, property_address: e.target.value }))} placeholder="123 Main St, City, State" className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Transaction Type</Label>
                <select value={form.transaction_type} onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value }))} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="purchase">Purchase</option>
                  <option value="listing">Listing</option>
                </select>
              </div>
              <div>
                <Label>Closing Date</Label>
                <Input type="date" value={form.closing_date} onChange={e => setForm(f => ({ ...f, closing_date: e.target.value }))} className="mt-1.5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Assign Agent *</Label>
                <select value={form.agent_email} onChange={e => handleAgentSelect(e.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select agent...</option>
                  {brokerageUsers.map(u => (
                    <option key={u.id} value={u.email}>{u.display_name || u.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Transaction Coordinator</Label>
                <select value={form.tc_email} onChange={e => handleTCSelect(e.target.value)} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select TC...</option>
                  {brokerageUsers.filter(u => isAdminRole(u.role)).map(u => (
                    <option key={u.id} value={u.email}>{u.display_name || u.full_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Buyers */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Buyer(s)</Label>
                <button type="button" onClick={() => setForm(f => ({ ...f, buyers: [...f.buyers, ''] }))} className="text-xs text-primary hover:underline">+ Add buyer</button>
              </div>
              <div className="mb-1.5">
                <ContactPicker user={user} placeholder="Pick a buyer from your contacts"
                  onPick={(c) => setForm(f => { const list = f.buyers.filter((x) => x.trim()); return { ...f, buyers: [...list, c.name], picked: [...(f.picked || []), { contact: c, role: 'buyer' }] }; })} />
              </div>
              {form.buyers.map((b, i) => (
                <div key={i} className="flex gap-2 mb-1.5">
                  <Input value={b} onChange={e => setForm(f => ({ ...f, buyers: f.buyers.map((x, j) => j === i ? e.target.value : x) }))} placeholder="Buyer full name" className="flex-1" />
                  {form.buyers.length > 1 && <button type="button" onClick={() => setForm(f => ({ ...f, buyers: f.buyers.filter((_, j) => j !== i) }))} className="text-muted-foreground hover:text-destructive px-1">✕</button>}
                </div>
              ))}
            </div>

            {/* Sellers */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Seller(s)</Label>
                <button type="button" onClick={() => setForm(f => ({ ...f, sellers: [...f.sellers, ''] }))} className="text-xs text-primary hover:underline">+ Add seller</button>
              </div>
              <div className="mb-1.5">
                <ContactPicker user={user} placeholder="Pick a seller from your contacts"
                  onPick={(c) => setForm(f => { const list = f.sellers.filter((x) => x.trim()); return { ...f, sellers: [...list, c.name], picked: [...(f.picked || []), { contact: c, role: 'seller' }] }; })} />
              </div>
              {form.sellers.map((s, i) => (
                <div key={i} className="flex gap-2 mb-1.5">
                  <Input value={s} onChange={e => setForm(f => ({ ...f, sellers: f.sellers.map((x, j) => j === i ? e.target.value : x) }))} placeholder="Seller full name" className="flex-1" />
                  {form.sellers.length > 1 && <button type="button" onClick={() => setForm(f => ({ ...f, sellers: f.sellers.filter((_, j) => j !== i) }))} className="text-muted-foreground hover:text-destructive px-1">✕</button>}
                </div>
              ))}
            </div>

            <div>
              <Label>Sale Price</Label>
              <Input type="number" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} placeholder="450000" className="mt-1.5" />
            </div>

            {/* Key Dates */}
            <div>
              <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <Calendar className="w-4 h-4" /> Key Dates
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">🔍 Inspection Date</Label>
                  <Input type="date" value={form.inspection_date} onChange={e => setForm(f => ({ ...f, inspection_date: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">📊 Appraisal Date</Label>
                  <Input type="date" value={form.appraisal_date} onChange={e => setForm(f => ({ ...f, appraisal_date: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">💰 Financing Contingency</Label>
                  <Input type="date" value={form.financing_contingency_date} onChange={e => setForm(f => ({ ...f, financing_contingency_date: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">📋 Inspection Contingency</Label>
                  <Input type="date" value={form.inspection_contingency_date} onChange={e => setForm(f => ({ ...f, inspection_contingency_date: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">🏦 Loan Approval Date</Label>
                  <Input type="date" value={form.loan_approval_date} onChange={e => setForm(f => ({ ...f, loan_approval_date: e.target.value }))} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">📝 Title Deadline</Label>
                  <Input type="date" value={form.title_deadline_date} onChange={e => setForm(f => ({ ...f, title_deadline_date: e.target.value }))} className="mt-1" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createTransaction.mutate(form)} disabled={!form.property_address || !form.agent_email || createTransaction.isPending}>
              {createTransaction.isPending ? 'Creating...' : 'Create File'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={!!editingTx} onOpenChange={() => setEditingTx(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          {editingTx && (
            <div className="space-y-4 py-2">
              <div>
                <Label>Property Address *</Label>
                <Input value={editingTx.property_address} onChange={e => setEditingTx(t => ({ ...t, property_address: e.target.value }))} className="mt-1.5" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Transaction Type</Label>
                  <select value={editingTx.transaction_type} onChange={e => setEditingTx(t => ({ ...t, transaction_type: e.target.value }))} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="purchase">Purchase</option>
                    <option value="listing">Listing</option>
                  </select>
                </div>
                <div>
                  <Label>Status</Label>
                  <select value={editingTx.status} onChange={e => setEditingTx(t => ({ ...t, status: e.target.value }))} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {isAdmin ? (
                  <div>
                    <Label>Assign Agent *</Label>
                    <select value={editingTx.agent_email} onChange={e => {
                      const agent = brokerageUsers.find(u => u.email === e.target.value);
                      setEditingTx(t => ({ ...t, agent_email: e.target.value, agent_name: agent?.display_name || agent?.full_name || '' }));
                    }} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">Select agent...</option>
                      {brokerageUsers.map(u => <option key={u.id} value={u.email}>{u.display_name || u.full_name}</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <Label>Agent</Label>
                    <Input value={editingTx.agent_name} disabled className="mt-1.5 opacity-60" />
                  </div>
                )}
                <div>
                  <Label>Transaction Coordinator</Label>
                  <select value={editingTx.tc_email || ''} onChange={e => {
                    const tc = brokerageUsers.find(u => u.email === e.target.value);
                    setEditingTx(t => ({ ...t, tc_email: e.target.value, tc_name: tc?.display_name || tc?.full_name || '' }));
                  }} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">None</option>
                    {brokerageUsers.map(u => <option key={u.id} value={u.email}>{u.display_name || u.full_name}{u.email === user?.email ? ' (me)' : ''}</option>)}
                  </select>
                </div>
              </div>
              {/* Buyers */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>Buyer(s)</Label>
                  <button type="button" onClick={() => setEditingTx(t => ({ ...t, buyers: [...t.buyers, ''] }))} className="text-xs text-primary hover:underline">+ Add buyer</button>
                </div>
                {editingTx.buyers.map((b, i) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <Input value={b} onChange={e => setEditingTx(t => ({ ...t, buyers: t.buyers.map((x, j) => j === i ? e.target.value : x) }))} placeholder="Buyer full name" className="flex-1" />
                    {editingTx.buyers.length > 1 && <button type="button" onClick={() => setEditingTx(t => ({ ...t, buyers: t.buyers.filter((_, j) => j !== i) }))} className="text-muted-foreground hover:text-destructive px-1">✕</button>}
                  </div>
                ))}
              </div>
              {/* Sellers */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label>Seller(s)</Label>
                  <button type="button" onClick={() => setEditingTx(t => ({ ...t, sellers: [...t.sellers, ''] }))} className="text-xs text-primary hover:underline">+ Add seller</button>
                </div>
                {editingTx.sellers.map((s, i) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <Input value={s} onChange={e => setEditingTx(t => ({ ...t, sellers: t.sellers.map((x, j) => j === i ? e.target.value : x) }))} placeholder="Seller full name" className="flex-1" />
                    {editingTx.sellers.length > 1 && <button type="button" onClick={() => setEditingTx(t => ({ ...t, sellers: t.sellers.filter((_, j) => j !== i) }))} className="text-muted-foreground hover:text-destructive px-1">✕</button>}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Sale Price</Label>
                  <Input type="number" value={editingTx.sale_price} onChange={e => setEditingTx(t => ({ ...t, sale_price: e.target.value }))} placeholder="450000" className="mt-1.5" />
                </div>
                <div>
                  <Label>Closing Date</Label>
                  <Input type="date" value={editingTx.closing_date || ''} onChange={e => setEditingTx(t => ({ ...t, closing_date: e.target.value }))} className="mt-1.5" />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTx(null)}>Cancel</Button>
            <Button onClick={() => saveEditTx.mutate({ id: editingTx.id, data: editingTx })} disabled={!editingTx?.property_address || !editingTx?.agent_email || saveEditTx.isPending}>
              {saveEditTx.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Closing Review Prompt */}
      {closingPromptTx && (
        <ClosingReviewPrompt
          tx={closingPromptTx}
          user={user}
          open={!!closingPromptTx}
          onClose={() => setClosingPromptTx(null)}
        />
      )}

      {/* Add Update Dialog */}
      <Dialog open={!!showUpdate} onOpenChange={() => setShowUpdate(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Post Update</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Milestone</Label>
              <select value={updateForm.milestone} onChange={e => setUpdateForm(f => ({ ...f, milestone: e.target.value }))} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">No milestone</option>
                {MILESTONES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <Label>Message *</Label>
              <Textarea value={updateForm.message} onChange={e => setUpdateForm(f => ({ ...f, message: e.target.value }))} placeholder="Describe the update..." className="mt-1.5 resize-none h-24" />
            </div>
            <div>
              <Label>Flag</Label>
              <select value={updateForm.flag} onChange={e => setUpdateForm(f => ({ ...f, flag: e.target.value }))} className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="none">No flag</option>
                <option value="action_needed">⚠ Action Needed</option>
                <option value="resolved">✅ Resolved</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdate(null)}>Cancel</Button>
            <Button
              onClick={() => addUpdate.mutate({ transactionId: showUpdate, update: updateForm })}
              disabled={!updateForm.message || addUpdate.isPending}
            >
              {addUpdate.isPending ? 'Posting...' : 'Post Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}