import React, { useEffect, useState } from 'react';
import { isPdfUrl } from './PDFPageRenderer';
import { autoDetectFields } from './autoDetectFields';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Loader2, Upload, Edit2, Users, Send, FileText, LayoutTemplate, X, ShieldCheck, Bell, ListOrdered, Sparkles, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { motion } from 'framer-motion';
import ESignFieldEditor, { fillFromDeal } from './ESignFieldEditor';
import { fieldSignerIndex } from '../../../shared/esignGeometry.js';
import SignerManagementDashboard from './SignerManagementDashboard';

const STEPS = [
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'signers', label: 'Signers', icon: Users },
  { id: 'fields', label: 'Fields', icon: Edit2 },
  { id: 'send', label: 'Send', icon: Send },
];

// Also used from Transactions and the Contract Generator (replacing DocuSeal):
// pass `initialTitle` / `initialDocumentUrl` to start from an existing file and
// `transactionId` to link the signing request to a transaction.
export default function UnifiedESignCreator({
  onComplete,
  user: userProp,
  brokerageId: brokerageIdProp,
  initialTitle = '',
  initialDocumentUrl = '',
  transactionId,
  checklistLink, // { checklist_id, item_id }: the signed copy lands on that checklist item
  initialSigners = [],
  initialForm, // a contract form from the library ({ id, name, document_url, fields, roles })
  facts, // extra facts to fill boxes from (e.g. an offer's terms), merged over the deal
  onCancel,
}) {
  const outlet = useOutletContext() || {};
  const user = userProp || outlet.user;
  const brokerageId = brokerageIdProp || outlet.brokerageId;
  const queryClient = useQueryClient();

  const [step, setStep] = useState('upload');
  const [dealId, setDealId] = useState(transactionId || '');
  const [title, setTitle] = useState(initialTitle);
  const [documentUrl, setDocumentUrl] = useState(initialDocumentUrl);
  // Signers: a form's roles (Buyer 1, Seller 1...) filled with the people given, by role.
  const [signers, setSigners] = useState(() => {
    if (!initialForm?.roles?.length) return initialSigners;
    const base = (r) => String(r || '').replace(/\s*\d+$/, '').trim().toLowerCase();
    const rows = initialForm.roles.map((r, k) => ({ id: `role-${k}-${Date.now()}`, role: r, role_index: k, name: '', email: '' }));
    const extra = [];
    for (const s of initialSigners) {
      const at = rows.findIndex((x) => !x.email && s.role && base(x.role) === base(s.role));
      if (at >= 0) rows[at] = { ...rows[at], name: s.name || '', email: s.email || '' };
      else extra.push(s);
    }
    return [...rows, ...extra];
  });
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [creating, setCreating] = useState(false);

  const [currentDoc, setCurrentDoc] = useState(null);
  const [sequential, setSequential] = useState(false);
  const [message, setMessage] = useState('');
  // Files and templates that make up the document (more than one becomes a packet).
  // A file passed with a form (e.g. an offer's cover letter) goes in front of it.
  const [parts, setParts] = useState(() => [
    ...(initialDocumentUrl ? [{ kind: 'file', url: initialDocumentUrl, name: initialForm ? 'Cover letter' : initialTitle || 'Document' }] : []),
    ...(initialForm ? [{ kind: 'form', id: initialForm.id, name: initialForm.name, roles: initialForm.roles || [], url: initialForm.document_url, form: initialForm }] : []),
  ]);
  const [builtKey, setBuiltKey] = useState(null);
  const [building, setBuilding] = useState(false);
  const [remindDays, setRemindDays] = useState(2);
  const [requireCode, setRequireCode] = useState(false);
  const [preflight, setPreflight] = useState(null); // { issues, ai } | 'loading'

  // Contract forms library: platform-wide forms plus this brokerage's (security rules decide).
  const { data: contractForms = [] } = useQuery({
    queryKey: ['contract-forms', brokerageId],
    queryFn: () => base44.entities.ContractForm.list('state', 500).then((l) => l.filter((f) => f.is_active !== false)).catch(() => []),
  });
  const [formState, setFormState] = useState('');
  const { data: templates = [] } = useQuery({
    queryKey: ['esign-templates', brokerageId],
    enabled: !!brokerageId,
    queryFn: () => base44.entities.ESignTemplate.filter({ brokerage_id: brokerageId }, '-created_date', 100),
  });
  const { data: myDeals = [] } = useQuery({
    queryKey: ['esign-my-deals', brokerageId],
    enabled: !!brokerageId && !transactionId,
    queryFn: () => base44.entities.Transaction.filter({ brokerage_id: brokerageId }, '-created_date', 200).catch(() => []),
  });
  const { data: deal = null } = useQuery({
    queryKey: ['esign-deal', dealId],
    enabled: !!dealId,
    queryFn: () => base44.entities.Transaction.get(dealId).catch(() => null),
  });

  // Check the document whenever the Send step opens.
  useEffect(() => {
    if (step !== 'send' || !currentDoc) return;
    let live = true;
    setPreflight('loading');
    base44.functions.invoke('esignPreflight', { documentId: currentDoc.id, signers: signers.filter((s) => s.email || s.name), transactionId: dealId || undefined })
      .then((r) => live && setPreflight(r.data))
      .catch(() => live && setPreflight(null));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentDoc?.id]);

  const handleFileUpload = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError(null);
    // Name the document after the first file unless a title was typed.
    if (!title.trim()) setTitle(files[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim());
    setFileName(files[0].name);
    try {
      for (const file of files) {
        // Private: to the deal when sent from one, otherwise to the sender (and admins).
        const response = await base44.integrations.Core.UploadFile({ file, scope: dealId ? { kind: 'tx', id: dealId } : { kind: 'user', id: user?.id } });
        const url = response?.file_url || response?.data?.file_url;
        if (!url) throw new Error('no link came back');
        setParts((p) => [...p, { kind: 'file', url, name: file.name }]);
        setDocumentUrl(url);
      }
    } catch (err) {
      setError('Failed to upload document: ' + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const addForm = (f) => {
    setParts((p) => [...p, { kind: 'form', id: f.id, name: f.name, roles: f.roles || [], url: f.document_url, form: f }]);
    if (!title.trim()) setTitle(f.name || '');
    if (!signers.length && (f.roles || []).length) setSigners(f.roles.map((r, i) => ({ id: `role-${i}-${Date.now()}`, role: r, role_index: i, name: '', email: '' })));
  };
  const addTemplate = (t) => {
    setParts((p) => [...p, { kind: 'template', id: t.id, name: t.title, roles: t.roles || [], url: t.document_url }]);
    if (!title.trim()) setTitle(t.title || '');
    // Template roles become empty signer rows to fill in (Buyer 1, Buyer 2...).
    if (!signers.length && (t.roles || []).length) setSigners(t.roles.map((r, i) => ({ id: `role-${i}-${Date.now()}`, role: r, role_index: i, name: '', email: '' })));
  };
  // A library form with boxes already set up (by an admin) is used as its template automatically.
  const autoTemplated = React.useRef(new Set());
  useEffect(() => {
    if (!templates.length) return;
    parts.forEach((p, i) => {
      if (p.kind !== 'file' || autoTemplated.current.has(p.url)) return;
      const t = templates.find((x) => x.document_url === p.url && (x.fields || []).length);
      autoTemplated.current.add(p.url);
      if (!t) return;
      setParts((list) => list.map((x, j) => (j === i ? { kind: 'template', id: t.id, name: p.name || t.title, roles: t.roles || [], url: t.document_url, auto: true } : x)));
      if ((t.roles || []).length) setSigners((cur) => (cur.length ? cur : t.roles.map((r, k) => ({ id: `role-${k}-${Date.now()}`, role: r, role_index: k, name: '', email: '' }))));
    });
  }, [templates, parts]);
  const removePart = (i) => setParts((p) => p.filter((_, j) => j !== i));

  // One file: used as is. One template: its file and boxes. Several: merged into one packet.
  const buildDocument = async () => {
    if (parts.length === 1 && parts[0].kind === 'file') return { document_url: parts[0].url, fields: null };
    if (parts.length === 1 && parts[0].kind === 'form') {
      const f = parts[0].form || contractForms.find((x) => x.id === parts[0].id);
      return { document_url: f?.document_url || parts[0].url, fields: (f?.fields || []).map((x, i) => ({ ...x, id: x.id || `field-${i}-${Date.now()}` })) };
    }
    if (parts.length === 1 && parts[0].kind === 'template') {
      const t = templates.find((x) => x.id === parts[0].id);
      return { document_url: t?.document_url || parts[0].url, fields: (t?.fields || []).map((f, i) => ({ ...f, id: f.id || `field-${i}-${Date.now()}` })) };
    }
    const res = await base44.functions.invoke('esignPacket', {
      title, transactionId: dealId || undefined,
      parts: parts.map((p) => (p.kind === 'template' ? { templateId: p.id } : p.kind === 'form' ? { formId: p.id } : { url: p.url })),
    });
    return { document_url: res.data.document_url, fields: res.data.fields || [] };
  };

  const canProceed = () => {
    if (step === 'upload') return title.trim() && parts.length > 0;
    if (step === 'signers') return signers.length > 0 && signers.every((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email || ''));
    if (step === 'fields') return currentDoc?.fields?.length > 0;
    return true;
  };

  const handleFieldsComplete = async () => {
    // Refetch document to get updated fields
    try {
      const updated = await base44.entities.ESignDocument.get(currentDoc.id);
      setCurrentDoc(updated);
    } catch (err) {
      console.error('Failed to refresh document:', err);
    }
    setStep('send');
  };

  const handleSend = async () => {
    setCreating(true);
    setError(null);

    try {
      const res = await base44.functions.invoke('createESignSubmission', {
        documentId: currentDoc.id,
        documentTitle: currentDoc.title,
        signers: signers.filter(s => s.email),
        sequenceType: sequential ? 'sequential' : 'all_at_once',
        message: message.trim() || undefined,
        transactionId: dealId || undefined,
        options: { verify: requireCode ? 'email' : null, remindDays },
      });

      await queryClient.invalidateQueries({ queryKey: ['esign-documents', brokerageId] });
      onComplete?.({
        document: currentDoc,
        submissionId: res.data?.submission_id,
        signers: signers.filter((s) => s.email),
      });
    } catch (err) {
      setError('Failed to send: ' + (err.message || err));
    } finally {
      setCreating(false);
    }
  };

  const handleNextStep = async () => {
    if (step === 'upload') {
      setError(null);
      setBuilding(true);
      try {
        const key = JSON.stringify(parts.map((p) => p.id || p.url));
        if (currentDoc && key === builtKey) {
          const updated = await base44.entities.ESignDocument.update(currentDoc.id, { title, transaction_id: dealId || null });
          setCurrentDoc(updated);
          setStep('signers');
          return;
        }
        const built = await buildDocument();
        // Boxes tied to deal facts fill themselves in from this deal.
        if (built.fields && (dealId || facts)) {
          const d = dealId ? deal || await base44.entities.Transaction.get(dealId).catch(() => null) : null;
          built.fields = fillFromDeal(built.fields, { ...(d || {}), ...(facts || {}) });
        }
        setDocumentUrl(built.document_url);
        setBuiltKey(key);
        if (currentDoc) {
          const updated = await base44.entities.ESignDocument.update(currentDoc.id, { title, transaction_id: dealId || null, document_url: built.document_url, ...(built.fields ? { fields: built.fields } : {}) });
          setCurrentDoc(updated);
          setStep('signers');
          return;
        }
        const doc = await base44.entities.ESignDocument.create({
          brokerage_id: brokerageId,
          title,
          ...(dealId ? { transaction_id: dealId } : {}),
          ...(checklistLink ? { checklist_id: checklistLink.checklist_id, checklist_item_id: checklistLink.item_id } : {}),
          document_url: built.document_url,
          fields: built.fields || [],
          signers: [],
          created_by_email: user.email,
          created_by_name: user.full_name,
        });
        setCurrentDoc(doc);
        setStep('signers');
      } catch (err) {
        setError('Failed to create document: ' + (err.message || err));
      } finally {
        setBuilding(false);
      }
    } else if (step === 'signers') {
      // Save signers to document
      try {
        // Template roles: boxes follow their role to its row; roles removed (e.g. no Buyer 2) lose their boxes.
        let fields = null;
        let rows = signers;
        if (signers.some((x) => Number.isInteger(x.role_index)) && (currentDoc.fields || []).length) {
          const map = new Map();
          signers.forEach((x, i) => { if (Number.isInteger(x.role_index)) map.set(x.role_index, i); });
          fields = currentDoc.fields
            .filter((f) => f.sender_fill || f.type === 'strike' || map.has(fieldSignerIndex(f)))
            .map((f) => (map.has(fieldSignerIndex(f)) ? { ...f, signer_index: map.get(fieldSignerIndex(f)) } : { ...f, signer_index: 0 }));
          rows = signers.map((x, i) => (Number.isInteger(x.role_index) ? { ...x, role_index: i } : x));
          setSigners(rows);
        }
        const updated = await base44.entities.ESignDocument.update(currentDoc.id, {
          signers: rows.map(({ id, ...rest }) => ({ ...rest, email: (rest.email || '').trim().toLowerCase() })),
          ...(fields ? { fields } : {}),
        });
        setCurrentDoc(updated);
        setStep('fields');
      } catch (err) {
        setError('Failed to save signers: ' + (err.message || err));
      }
    } else if (step === 'fields') {
      setStep('send');
    }
  };

  const currentStepIndex = STEPS.findIndex(s => s.id === step);

  const docFields = currentDoc?.fields || [];
  const missingSignature = signers
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.email && !docFields.some((f) => {
      const n = Number(f.signer_index);
      const idx = Number.isInteger(n) && n >= 0 ? n : 0;
      return idx === i && (f.type === 'signature' || f.type === 'initial');
    }))
    .map(({ s }) => s.name || s.email);

  return (
    <div className="space-y-6 py-4">
      {/* Progress Indicator */}
      <div className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-2">
        {STEPS.map((s, idx) => {
          const StepIcon = s.icon;
          const isActive = s.id === step;
          const isCompleted = idx < currentStepIndex;

          return (
            <motion.button
              key={s.id}
              onClick={() => idx <= currentStepIndex && setStep(s.id)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-1 sm:px-4 py-1.5 sm:py-2 rounded-lg border transition-all min-w-0 ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : isCompleted
                  ? 'bg-green-100 text-green-900 border-green-300'
                  : 'bg-muted text-muted-foreground border-border/40'
              } ${idx <= currentStepIndex && 'cursor-pointer hover:bg-primary/90'}`}
              disabled={idx > currentStepIndex}
            >
              <StepIcon className="w-4 h-4" />
              <span className="text-[11px] sm:text-sm font-medium truncate max-w-full">{s.label}</span>
            </motion.button>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="space-y-4">
        {/* Step 1: Upload */}
        {step === 'upload' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">
                Document Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Purchase Agreement"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm"
              />
            </div>

            {!transactionId && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Deal (optional)</label>
                <select value={dealId} onChange={(e) => setDealId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm">
                  <option value="">Not for a deal</option>
                  {myDeals.map((t) => <option key={t.id} value={t.id}>{t.property_address || 'Untitled deal'}{t.status ? ` (${t.status})` : ''}</option>)}
                </select>
                <p className="text-xs text-muted-foreground mt-1">The signed copy goes into that deal's Unsorted documents, ready to sort onto a checklist.</p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Files *</label>
              <label className="block cursor-pointer">
                <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileUpload} disabled={uploading} className="hidden" />
                <div className="border-2 border-dashed border-border/40 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  {uploading ? (
                    <><Loader2 className="w-7 h-7 animate-spin mx-auto text-primary mb-2" /><p className="text-sm text-muted-foreground">Uploading {fileName}…</p></>
                  ) : (
                    <><Upload className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium text-foreground">{parts.length ? 'Add another file' : 'Click to upload'}</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, PNG or JPG. Pick several to send them as one packet.</p></>
                  )}
                </div>
              </label>
            </div>

            {templates.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5"><LayoutTemplate className="w-4 h-4" /> Start from a template</p>
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <button key={t.id} type="button" onClick={() => addTemplate(t)}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs hover:border-primary hover:text-primary">
                      + {t.title || 'Template'} <span className="text-muted-foreground">({(t.fields || []).length} boxes)</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {contractForms.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-medium flex items-center gap-1.5"><FileText className="w-4 h-4" /> Contract forms</p>
                  <select value={formState} onChange={(e) => setFormState(e.target.value)} className="ml-auto rounded-md border border-border bg-background px-2 py-1 text-xs">
                    <option value="">All states</option>
                    {[...new Set(contractForms.map((f) => f.state).filter(Boolean))].sort().map((st) => <option key={st} value={st}>{st}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contractForms.filter((f) => !formState || f.state === formState).map((f) => (
                    <button key={f.id} type="button" onClick={() => addForm(f)}
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs hover:border-primary hover:text-primary">
                      + {f.state ? `${f.state} · ` : ''}{f.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {parts.length > 0 && (
              <div className="rounded-lg border border-border/60 divide-y">
                {parts.map((p, i) => (
                  <div key={`${p.id || p.url}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    {p.kind === 'template' ? <LayoutTemplate className="w-4 h-4 text-purple-600" /> : <FileText className={`w-4 h-4 ${p.kind === 'form' ? 'text-emerald-600' : 'text-blue-600'}`} />}
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.kind === 'form' && <span className="text-[10px] uppercase text-emerald-700">contract form</span>}
                    {p.kind === 'template' && <span className="text-[10px] uppercase text-purple-600">{p.auto ? 'fields ready' : 'template'}</span>}
                    <button type="button" onClick={() => removePart(i)} className="p-1 rounded hover:bg-muted" aria-label="Remove"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                {parts.length > 1 && <p className="px-3 py-2 text-xs text-muted-foreground">These {parts.length} will be joined in this order into one document, signed once.</p>}
              </div>
            )}
          </motion.div>
        )}

        {/* Step 2: Fields */}
        {step === 'fields' && currentDoc && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ESignFieldEditor
              onAutoDetect={isPdfUrl(currentDoc.document_url) ? autoDetectFields : undefined}
              doc={currentDoc}
              deal={deal || facts ? { ...(deal || {}), ...(facts || {}) } : null}
              autoRun={!!facts && isPdfUrl(currentDoc.document_url) && !(currentDoc.fields || []).some((f) => f.auto)}
              onChange={(fields) => setCurrentDoc((d) => (d ? { ...d, fields } : d))}
              onComplete={handleFieldsComplete}
            />
          </motion.div>
        )}

        {/* Step 3: Signers */}
        {step === 'signers' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <SignerManagementDashboard
              document={currentDoc}
              submissions={[]}
              onSignersChange={setSigners}
              initialSigners={signers}
              transactionId={dealId}
              me={user}
            />
          </motion.div>
        )}

        {/* Step 4: Send */}
        {step === 'send' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-foreground">Review Before Sending</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Document</p>
                  <p className="font-medium text-foreground">{currentDoc?.title}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fields</p>
                  <p className="font-medium text-foreground">{currentDoc?.fields?.length || 0} fields placed</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recipients</p>
                  <p className="font-medium text-foreground">{signers.length} signers</p>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {signers.length > 1 && (
                <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={sequential} onChange={(e) => setSequential(e.target.checked)} />
                  <span><span className="font-medium flex items-center gap-1.5"><ListOrdered className="w-4 h-4" /> Sign in order</span>
                    <span className="block text-muted-foreground text-xs">Each person is emailed after the one before them signs.</span></span>
                </label>
              )}
              <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={requireCode} onChange={(e) => setRequireCode(e.target.checked)} />
                <span><span className="font-medium flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Confirm identity</span>
                  <span className="block text-muted-foreground text-xs">Signers enter a code we email them before they can open it.</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3 text-sm">
                <Bell className="w-4 h-4 mt-0.5" />
                <span className="flex-1"><span className="font-medium">Automatic reminders</span>
                  <select className="mt-1 block w-full rounded-md border border-border bg-background px-2 py-1 text-sm" value={remindDays} onChange={(e) => setRemindDays(Number(e.target.value))}>
                    <option value={1}>Every day</option><option value={2}>Every 2 days</option><option value={3}>Every 3 days</option><option value={7}>Every week</option><option value={0}>Off</option>
                  </select></span>
              </label>
            </div>
            <label className="block text-sm">
              <span className="font-medium">Message to signers (optional)</span>
              <textarea className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" rows={3}
                value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Please review and sign at your earliest convenience." />
            </label>

            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-sm font-medium flex items-center gap-1.5 mb-2"><Sparkles className="w-4 h-4 text-purple-600" /> Pre-send check</p>
              {preflight === 'loading' ? (
                <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking the document, signers and deal…</p>
              ) : !preflight ? (
                <p className="text-xs text-muted-foreground">The check isn't available right now. You can still send.</p>
              ) : preflight.issues?.length ? (
                <ul className="space-y-1.5">
                  {preflight.issues.map((it, i) => {
                    const Icon = it.severity === 'critical' ? AlertCircle : it.severity === 'warning' ? AlertTriangle : Info;
                    const color = it.severity === 'critical' ? 'text-red-600' : it.severity === 'warning' ? 'text-amber-600' : 'text-blue-600';
                    return (
                      <li key={i} className="flex gap-2 text-sm">
                        <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
                        <span><span className="font-medium">{it.title}</span>{it.ai && <span className="ml-1 text-[10px] text-purple-600">AI</span>}<span className="block text-xs text-muted-foreground">{it.detail}</span></span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-green-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Looks good{preflight.ai ? ', including an AI read of the document' : ''}.</p>
              )}
            </div>
            {missingSignature.length > 0 ? (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-900">
                {missingSignature.join(', ')} {missingSignature.length === 1 ? 'has' : 'have'} no signature or initials field.
                Go back to Fields and add one, so every signature ends up on the document.
              </div>
            ) : (
              <div className="bg-accent/10 border border-accent rounded-lg p-4">
                <p className="text-sm text-accent-foreground">
                  Ready to send to {signers.length} recipient{signers.length !== 1 ? 's' : ''}. Everyone gets the fully signed PDF by email when the last person signs.
                </p>
              </div>
            )}
          </motion.div>
        )}
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

      {/* Navigation Buttons */}
      <div className="sticky bottom-0 -mx-1 px-1 pb-1 bg-background flex flex-wrap items-center justify-between gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-border/40 z-20">
        <Button
          variant="outline"
          onClick={() => {
            if (step === 'upload') (onCancel ? onCancel() : onComplete?.(null));
            else setStep(STEPS[currentStepIndex - 1].id);
          }}
          disabled={creating}
        >
          {step === 'upload' ? 'Cancel' : 'Back'}
        </Button>

        {step !== 'send' && !canProceed() && !uploading && (
          <p className="order-first sm:order-none basis-full sm:basis-auto text-xs text-muted-foreground sm:self-center sm:ml-auto">
            {step === 'upload' ? (!parts.length ? 'Upload a file or pick a template to continue.' : 'Add a title to continue.') : step === 'signers' ? (signers.length ? 'Every signer needs an email address.' : 'Add at least one signer.') : step === 'fields' ? 'Place at least one field.' : ''}
          </p>
        )}
        {step !== 'send' && (
          <Button
            onClick={handleNextStep}
            disabled={!canProceed() || uploading || creating || building}
            className="gap-2"
          >
            {creating || building ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Next: {STEPS[currentStepIndex + 1]?.label || 'Complete'}
          </Button>
        )}

        {step === 'send' && (
          <Button
            onClick={handleSend}
            disabled={creating || missingSignature.length > 0}
            className="gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send for Signature
          </Button>
        )}
      </div>
    </div>
  );
}