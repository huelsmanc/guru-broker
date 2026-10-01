import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Search, PenTool, LayoutTemplate, Trash2, Loader2, Globe, Building2, Eye, Upload } from 'lucide-react';
import { FieldsSetupDialog, ROLE_PRESETS } from '@/components/repository/FormFieldsDialog';
import { isAdminRole } from '../../../shared/permissions.generated.js';

export const FORM_TYPES = [
  { id: 'purchase_agreement', label: 'Purchase agreement' },
  { id: 'listing_agreement', label: 'Listing agreement' },
  { id: 'buyer_rep', label: 'Buyer representation' },
  { id: 'disclosure', label: 'Disclosure' },
  { id: 'other', label: 'Other' },
];
export const typeLabel = (t) => FORM_TYPES.find((x) => x.id === t)?.label || 'Other';

export const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');

/** Every contract form this person can use: platform-wide ones plus their brokerage's. */
export function useContractForms(brokerageId, { all = false } = {}) {
  return useQuery({
    queryKey: ['contract-forms-all', brokerageId, all],
    queryFn: async () => (await base44.entities.ContractForm.list('state', 1000).catch(() => [])).filter((f) => all || f.is_active !== false),
  });
}

/**
 * The forms library: state forms, each set up once with its boxes. Admins add their
 * brokerage's forms; the platform owner (super admin) adds forms every brokerage can use.
 */
export default function FormsLibrary({ user, brokerageId, onUse }) {
  const queryClient = useQueryClient();
  const isSuper = user?.role === 'super_admin';
  const isAdmin = isSuper || isAdminRole(user?.role);
  const { data: forms = [], isLoading } = useContractForms(brokerageId, { all: isAdmin });
  const [q, setQ] = useState('');
  const [state, setState] = useState('');
  const [type, setType] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [setup, setSetup] = useState(null);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['contract-forms-all'] });
    queryClient.invalidateQueries({ queryKey: ['contract-forms'] });
  };

  const states = [...new Set(forms.map((f) => f.state).filter(Boolean))].sort();
  const shown = useMemo(() => forms
    .filter((f) => !state || f.state === state)
    .filter((f) => !type || f.form_type === type)
    .filter((f) => !q || `${f.name} ${f.description || ''} ${f.form_version || ''}`.toLowerCase().includes(q.toLowerCase())),
  [forms, state, type, q]);
  const canEdit = (f) => isSuper || (isAdmin && f.brokerage_id === brokerageId);

  const remove = async (f) => {
    if (!window.confirm(`Delete "${f.name}"? Documents already sent keep their copy.`)) return;
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
        <select value={state} onChange={(e) => setState(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">All states</option>
          {states.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">All types</option>
          {FORM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {isAdmin && <Button className="gap-1.5" onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add a form</Button>}
      </div>

      {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /> : !shown.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {forms.length ? 'No forms match.' : isAdmin ? 'No forms yet. Add your state\'s purchase agreement, listing agreement, buyer representation agreement and disclosures, then set up their boxes once.' : 'No forms yet. Ask your broker to add your state\'s forms.'}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map((f) => {
            const boxes = (f.fields || []).length;
            return (
              <div key={f.id} className={`rounded-xl border bg-card p-4 flex flex-col gap-2 ${f.is_active === false ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0">{f.state || '-'}</div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{typeLabel(f.form_type)}{f.form_version ? ` · ${f.form_version}` : ''}</p>
                  </div>
                </div>
                {f.description && <p className="text-xs text-muted-foreground line-clamp-2">{f.description}</p>}
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 ${f.brokerage_id === 'platform' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}`}>
                    {f.brokerage_id === 'platform' ? <><Globe className="w-3 h-3 inline -mt-0.5" /> All brokerages</> : <><Building2 className="w-3 h-3 inline -mt-0.5" /> Your brokerage</>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 ${boxes ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{boxes ? `${boxes} boxes ready` : 'Boxes not set up'}</span>
                  {(f.roles || []).length > 0 && <span className="rounded-full px-2 py-0.5 bg-muted">{f.roles.join(', ')}</span>}
                  {f.is_active === false && <span className="rounded-full px-2 py-0.5 bg-muted">Hidden</span>}
                </div>
                <div className="flex flex-wrap gap-2 mt-auto pt-2">
                  {boxes > 0 && f.is_active !== false && onUse && <Button size="sm" className="gap-1.5" onClick={() => onUse(f)}><PenTool className="w-3.5 h-3.5" /> Use</Button>}
                  <a href={f.document_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><Eye className="w-3.5 h-3.5" /> View</Button></a>
                  {canEdit(f) && (
                    <>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSetup(f)}><LayoutTemplate className="w-3.5 h-3.5" /> {boxes ? 'Edit boxes' : 'Set up boxes'}</Button>
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
          onSaved={(f, isNew) => { setAdding(false); setEditing(null); refresh(); if (isNew) setSetup(f); }} />
      )}
      {setup && (
        <FieldsSetupDialog title={`${setup.state ? `${setup.state} · ` : ''}${setup.name}`} documentUrl={setup.document_url} fileName="form.pdf"
          brokerageId={brokerageId} initialFields={setup.fields || []} initialRoles={setup.roles} saved={(setup.fields || []).length > 0}
          defaultRoles={ROLE_PRESETS[setup.form_type] || ROLE_PRESETS.purchase_agreement}
          onSave={async (fields, roles) => { await base44.entities.ContractForm.update(setup.id, { fields, roles }); refresh(); }}
          onClose={() => setSetup(null)} />
      )}
    </div>
  );
}

function FormDetails({ form, user, brokerageId, onClose, onSaved }) {
  const isSuper = user?.role === 'super_admin';
  const [f, setF] = useState(() => form || { state: 'CT', form_type: 'purchase_agreement', name: '', form_version: '', description: '', platform: isSuper && !brokerageId });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      let document_url = form?.document_url;
      const platform = form ? form.brokerage_id === 'platform' : !!f.platform;
      if (file) {
        if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error('Upload the form as a PDF.');
        const res = await base44.integrations.Core.UploadFile({ file, scope: { kind: 'forms', platform } });
        document_url = res.file_url;
      }
      if (!document_url) throw new Error('Choose the blank PDF form.');
      const data = { state: f.state, form_type: f.form_type, name: f.name.trim(), form_version: f.form_version || null, description: f.description || null, document_url };
      if (form) {
        // A new PDF can change the layout, so its boxes start over.
        const changed = file ? { fields: [], roles: form.roles } : {};
        const saved = await base44.entities.ContractForm.update(form.id, { ...data, ...changed });
        onSaved(saved, !!file);
      } else {
        const saved = await base44.entities.ContractForm.create({ ...data, brokerage_id: platform ? 'platform' : brokerageId, is_active: true, fields: [], roles: ROLE_PRESETS[f.form_type] || ROLE_PRESETS.purchase_agreement, created_by_email: user?.email });
        onSaved(saved, true);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{form ? 'Form details' : 'Add a contract form'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input className="mt-1" value={f.name} onChange={set('name')} placeholder="Standard Form Real Estate Contract" autoFocus /></div>
          <div>
            <Label>State</Label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.state || ''} onChange={set('state')}>
              {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Label>Type</Label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.form_type} onChange={set('form_type')}>
              {FORM_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div><Label>Version / revision</Label><Input className="mt-1" value={f.form_version || ''} onChange={set('form_version')} placeholder="rev 9.24" /></div>
          <div className="col-span-2"><Label>Notes for agents (optional)</Label><Input className="mt-1" value={f.description || ''} onChange={set('description')} placeholder="SmartMLS standard form, use for all CT residential sales" /></div>
          <label className="col-span-2 block">
            <span className="text-sm font-medium">{form ? 'Replace the PDF (optional)' : 'Blank form (PDF)'}</span>
            <span className="mt-1 flex items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm cursor-pointer hover:border-primary">
              <Upload className="w-4 h-4" /> {file ? file.name : 'Choose a PDF'}
              <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </span>
            {form && file && <span className="text-xs text-amber-700">A new PDF clears its boxes; you'll set them up again.</span>}
          </label>
          {!form && isSuper && (
            <label className="col-span-2 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={!!f.platform} onChange={set('platform')} />
              <span>Share with every brokerage<span className="block text-xs text-muted-foreground">Only you can change platform forms. Leave unticked to keep it to {brokerageId ? 'this brokerage' : 'your brokerage'}.</span></span>
            </label>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !f.name.trim() || (!form && !file) || (!form && !f.platform && !brokerageId)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : form ? 'Save' : 'Add and set up boxes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
