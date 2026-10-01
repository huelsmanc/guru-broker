import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Search, LayoutTemplate, Trash2, Loader2, Eye, Upload, Sparkles, FileText } from 'lucide-react';
import { FieldsSetupDialog, ROLE_PRESETS } from '@/components/repository/FormFieldsDialog';
import { isAdminRole } from '../../../shared/permissions.generated.js';
import { pdfPageTexts } from '@/lib/pdfText';
import ContractWizard from './ContractWizard';

export const FORM_TYPES = [
  { id: 'purchase_agreement', label: 'Purchase agreement' },
  { id: 'listing_agreement', label: 'Listing agreement' },
  { id: 'buyer_rep', label: 'Buyer representation' },
  { id: 'disclosure', label: 'Disclosure' },
  { id: 'addendum', label: 'Addendum' },
  { id: 'other', label: 'Other' },
];
export const typeLabel = (t) => FORM_TYPES.find((x) => x.id === t)?.label || 'Other';

/** The brokerage's own contract forms. */
export function useContractForms(brokerageId, { all = false } = {}) {
  return useQuery({
    queryKey: ['contract-forms-all', brokerageId, all],
    enabled: !!brokerageId,
    queryFn: async () => (await base44.entities.ContractForm.filter({ brokerage_id: brokerageId }, 'name', 1000).catch(() => []))
      .filter((f) => all || f.is_active !== false),
  });
}

/** Has the AI read this form and written its questions yet? Runs in the background after an upload. */
export async function prepareIntake(form) {
  try {
    const pages = await pdfPageTexts(form.document_url);
    await base44.functions.invoke('contractIntake', { form_id: form.id, text: pages.map((p) => `--- Page ${p.n} ---\n${p.text}`).join('\n') });
  } catch { /* it will be prepared the first time someone fills the form */ }
}

/**
 * The brokerage's forms library: upload any blank form (PDF), then anyone can "Fill with AI":
 * the AI asks the questions that form needs and fills the contract from the answers.
 */
export default function FormsLibrary({ user, brokerageId, brokerageName }) {
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'super_admin' || isAdminRole(user?.role);
  const { data: forms = [], isLoading } = useContractForms(brokerageId, { all: isAdmin });
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [setup, setSetup] = useState(null);
  const [filling, setFilling] = useState(null);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['contract-forms-all'] });
    queryClient.invalidateQueries({ queryKey: ['contract-forms'] });
  };

  const shown = useMemo(() => forms
    .filter((f) => !type || f.form_type === type)
    .filter((f) => !q || `${f.name} ${f.description || ''} ${f.form_version || ''} ${f.state || ''}`.toLowerCase().includes(q.toLowerCase())),
  [forms, type, q]);

  const remove = async (f) => {
    if (!window.confirm(`Delete "${f.name}"? Contracts already filled or sent keep their copy.`)) return;
    await base44.entities.ContractForm.delete(f.id);
    refresh();
  };
  const toggle = async (f) => { await base44.entities.ContractForm.update(f.id, { is_active: f.is_active === false }); refresh(); };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search forms" className="h-10 w-full bg-transparent text-sm outline-none" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">All types</option>
          {FORM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {isAdmin && brokerageId && <Button className="gap-1.5" onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Upload a form</Button>}
      </div>

      {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /> : !shown.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {forms.length ? 'No forms match.' : isAdmin
            ? 'No forms yet. Upload your blank purchase agreement, listing agreement, buyer agreement, disclosures or any other form as a PDF. Then press "Fill with AI" on it.'
            : 'No forms yet. Ask your broker to upload the brokerage\'s forms.'}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map((f) => {
            const boxes = (f.fields || []).length;
            return (
              <div key={f.id} className={`rounded-2xl border bg-card p-4 flex flex-col gap-2.5 ${f.is_active === false ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><FileText className="w-5 h-5" /></div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel(f.form_type)}{f.state ? ` · ${f.state}` : ''}{f.form_version ? ` · ${f.form_version}` : ''}</p>
                  </div>
                </div>
                {f.description && <p className="text-xs text-muted-foreground line-clamp-2">{f.description}</p>}
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 ${f.intake?.questions?.length ? 'bg-violet-100 text-violet-800' : 'bg-muted text-muted-foreground'}`}>
                    {f.intake?.questions?.length ? `AI ready · ${f.intake.questions.length} questions` : 'AI reads it on first use'}
                  </span>
                  {boxes > 0 && <span className="rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-800">{boxes} boxes set up</span>}
                  {f.is_active === false && <span className="rounded-full px-2 py-0.5 bg-muted">Hidden from agents</span>}
                </div>
                <div className="flex flex-wrap gap-2 mt-auto pt-1">
                  {f.is_active !== false && <Button size="sm" className="gap-1.5 bg-violet-600 hover:bg-violet-700" onClick={() => setFilling(f)}><Sparkles className="w-3.5 h-3.5" /> Fill with AI</Button>}
                  <a href={f.document_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><Eye className="w-3.5 h-3.5" /> View</Button></a>
                  {isAdmin && (
                    <>
                      <Button size="sm" variant="ghost" className="gap-1" onClick={() => setSetup(f)} title="Optional: place signature and fill-in boxes yourself"><LayoutTemplate className="w-3.5 h-3.5" /> Boxes</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>Details</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggle(f)}>{f.is_active === false ? 'Show' : 'Hide'}</Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(f)} aria-label="Delete"><Trash2 className="w-4 h-4" /></Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(adding || editing) && (
        <FormDetails form={editing} user={user} brokerageId={brokerageId}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={(f, fresh) => {
            setAdding(false); setEditing(null); refresh();
            if (fresh) prepareIntake(f).then(refresh);
          }} />
      )}
      {setup && (
        <FieldsSetupDialog title={setup.name} documentUrl={setup.document_url} fileName="form.pdf"
          brokerageId={brokerageId} initialFields={setup.fields || []} initialRoles={setup.roles} saved={(setup.fields || []).length > 0}
          defaultRoles={ROLE_PRESETS[setup.form_type] || ROLE_PRESETS.purchase_agreement}
          onSave={async (fields, roles) => { await base44.entities.ContractForm.update(setup.id, { fields, roles }); refresh(); }}
          onClose={() => setSetup(null)} />
      )}
      {filling && <ContractWizard form={filling} user={user} brokerageId={brokerageId} brokerageName={brokerageName} onClose={() => { setFilling(null); refresh(); }} />}
    </div>
  );
}

function FormDetails({ form, user, brokerageId, onClose, onSaved }) {
  const [f, setF] = useState(() => form || { form_type: 'purchase_agreement', name: '', state: '', form_version: '', description: '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      let document_url = form?.document_url;
      if (file) {
        if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error('Upload the form as a PDF.');
        document_url = (await base44.integrations.Core.UploadFile({ file, scope: { kind: 'forms' } })).file_url;
      }
      if (!document_url) throw new Error('Choose the blank PDF form.');
      const data = { form_type: f.form_type, name: f.name.trim(), state: (f.state || '').toUpperCase().slice(0, 2) || null, form_version: f.form_version || null, description: f.description || null, document_url };
      if (form) {
        // A new PDF can change the layout and wording: its boxes and questions start over.
        const changed = file ? { fields: [], intake: null } : {};
        onSaved(await base44.entities.ContractForm.update(form.id, { ...data, ...changed }), !!file);
      } else {
        onSaved(await base44.entities.ContractForm.create({ ...data, brokerage_id: brokerageId, is_active: true, fields: [], roles: ROLE_PRESETS[f.form_type] || ROLE_PRESETS.purchase_agreement, created_by_email: user?.email }), true);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{form ? 'Form details' : 'Upload a form'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className="text-sm font-medium">{form ? 'Replace the PDF (optional)' : 'Blank form (PDF)'}</span>
            <span className="mt-1 flex items-center gap-2 rounded-xl border border-dashed px-3 py-4 text-sm cursor-pointer hover:border-primary">
              <Upload className="w-4 h-4" /> {file ? file.name : 'Choose a PDF'}
              <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => {
                const fl = e.target.files?.[0] || null; setFile(fl);
                if (fl && !f.name) setF((x) => ({ ...x, name: fl.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() }));
              }} />
            </span>
            {form && file && <span className="text-xs text-amber-700">A new PDF clears its boxes and AI questions; they're made again.</span>}
          </label>
          <div className="col-span-2"><Label>Name</Label><Input className="mt-1" value={f.name} onChange={set('name')} placeholder="Residential Purchase Agreement" /></div>
          <div>
            <Label>Type</Label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.form_type} onChange={set('form_type')}>
              {FORM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div><Label>State (optional)</Label><Input className="mt-1" value={f.state || ''} onChange={set('state')} placeholder="CT" maxLength={2} /></div>
          <div><Label>Version (optional)</Label><Input className="mt-1" value={f.form_version || ''} onChange={set('form_version')} placeholder="rev 9.24" /></div>
          <div className="col-span-2"><Label>Notes for agents (optional)</Label><Input className="mt-1" value={f.description || ''} onChange={set('description')} placeholder="Use for all residential sales" /></div>
        </div>
        {!form && <p className="text-xs text-muted-foreground">After you upload, the AI reads the form and writes the questions it needs. You don't have to set up any boxes.</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !f.name.trim() || (!form && !file) || !brokerageId}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : form ? 'Save' : 'Upload'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
