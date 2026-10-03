import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, ArrowUp, ArrowDown, Save, Copy, FileText, CheckSquare, Paperclip, Upload, X, PenLine } from 'lucide-react';
import { FieldsSetupDialog } from '@/components/repository/FormFieldsDialog';
import { isAdminRole } from '../../shared/permissions.generated.js';
import { Empty } from '@/components/workspace/ui';
import { LibraryPicker } from '@/components/workspace/WorkspaceChecklists';

const uid = () => Math.random().toString(36).slice(2, 10);
const sel = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const DEAL_TYPES = [['', 'Any'], ['buyer', 'Buyer'], ['listing', 'Listing'], ['dual', 'Dual agent'], ['rental_listing', 'Rental listing'], ['rental_tenant', 'Rental tenant'], ['referral', 'Referral']];

export default function ChecklistTemplates() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const key = ['checklist-templates-admin', brokerageId];
  const { data: templates = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!brokerageId,
    queryFn: async () => {
      await base44.functions.invoke('checklistAction', { action: 'templates' }); // seeds the starter set the first time
      return base44.entities.ChecklistTemplate.filter({ brokerage_id: brokerageId }, 'name', 300);
    },
  });
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formFor, setFormFor] = useState(null); // item index choosing a form from the library
  const [uploading, setUploading] = useState(null);
  const [signFor, setSignFor] = useState(null); // item index: setting up its e-sign boxes
  const { data: esignTemplates = [] } = useQuery({
    queryKey: ['esign-templates', brokerageId], enabled: !!brokerageId,
    queryFn: () => base44.entities.ESignTemplate.filter({ brokerage_id: brokerageId }, 'title', 300),
  });
  const esignById = new Map(esignTemplates.map((t) => [t.id, t]));
  if (!isAdminRole(user?.role)) return <div className="p-8 text-sm">Admins only.</div>;

  const save = async () => {
    setSaving(true);
    try {
      const data = { brokerage_id: brokerageId, name: edit.name.trim(), kind: edit.kind || 'transaction', deal_type: edit.deal_type || null, active: edit.active !== false, is_default: !!edit.is_default,
        items: edit.items.filter((i) => i.title.trim()).map((i) => ({ ...i, title: i.title.trim() })) };
      const saved = edit.id ? await base44.entities.ChecklistTemplate.update(edit.id, data) : await base44.entities.ChecklistTemplate.create(data);
      setEdit(structuredClone(saved));
      queryClient.invalidateQueries({ queryKey: key });
    } catch (err) { window.alert(err.message); } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${edit.name}"? Checklists already on deals stay as they are.`)) return;
    await base44.entities.ChecklistTemplate.delete(edit.id);
    setEdit(null);
    queryClient.invalidateQueries({ queryKey: key });
  };
  const setItem = (i, patch) => setEdit((e) => ({ ...e, items: e.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const uploadForm = async (i, file) => {
    if (!file) return;
    setUploading(i);
    try { const { file_url } = await base44.integrations.Core.UploadFile({ file, scope: { kind: 'misc' } }); setItem(i, { form_url: file_url, form_name: file.name }); }
    catch (err) { window.alert(err.message); } finally { setUploading(null); }
  };
  const move = (i, d) => setEdit((e) => { const items = [...e.items]; const [x] = items.splice(i, 1); items.splice(i + d, 0, x); return { ...e, items }; });

  const groups = [['transaction', 'Transaction checklists'], ['onboarding', 'Agent onboarding']];
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto grid md:grid-cols-[260px_1fr] gap-6">
      <aside>
        <h1 className="text-2xl font-bold mb-4">Checklist templates</h1>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : groups.map(([k, l]) => (
          <div key={k} className="mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">{l}</p>
            <ul className="space-y-1">{templates.filter((t) => (t.kind || 'transaction') === k).map((t) => (
              <li key={t.id}><button onClick={() => setEdit(structuredClone(t))} className={`w-full text-left rounded-lg px-3 py-2 text-sm border ${edit?.id === t.id ? 'bg-primary/10 border-primary' : 'bg-card hover:bg-muted'} ${t.active === false ? 'opacity-50' : ''}`}>{t.name}<span className="block text-xs text-muted-foreground">{(t.items || []).length} items</span></button></li>
            ))}</ul>
          </div>
        ))}
        <Button variant="outline" className="w-full gap-1.5" onClick={() => setEdit({ name: 'New checklist', kind: 'transaction', items: [{ id: uid(), title: '', requires_document: true, required: true }], active: true })}><Plus className="w-4 h-4" /> New template</Button>
      </aside>

      <main>
        {!edit ? <Empty>Pick a template to edit, or make your own. Attach a blank form to any document item and agents can fill and e-sign it right from the checklist. Agents pick checklists when an offer goes under contract (or from a deal's Checklists tab); onboarding templates go on agents from Manage Users.</Empty> : (
          <div className="rounded-xl border bg-card p-5">
            <div className="grid sm:grid-cols-3 gap-3 mb-5">
              <div className="sm:col-span-3"><Label>Name</Label><Input className="mt-1" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label>Used for</Label><select className={sel} value={edit.kind || 'transaction'} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}><option value="transaction">Transactions</option><option value="onboarding">Agent onboarding</option></select></div>
              {(edit.kind || 'transaction') === 'transaction' && <div><Label>Suggested for</Label><select className={sel} value={edit.deal_type || ''} onChange={(e) => setEdit({ ...edit, deal_type: e.target.value })}>{DEAL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>}
              <div className="flex flex-col justify-end gap-1 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={!!edit.is_default} onChange={(e) => setEdit({ ...edit, is_default: e.target.checked })} /> Add automatically</label>
              </div>
            </div>

            <ul className="space-y-2">
              {edit.items.map((it, i) => (
                <li key={it.id || i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                  <button title={it.requires_document ? 'Needs a document' : 'Task'} className="p-1.5 rounded hover:bg-muted" onClick={() => setItem(i, { requires_document: !it.requires_document })}>{it.requires_document ? <FileText className="w-4 h-4 text-primary" /> : <CheckSquare className="w-4 h-4 text-muted-foreground" />}</button>
                  <Input className="flex-1 min-w-[200px]" value={it.title} placeholder="Item" onChange={(e) => setItem(i, { title: e.target.value })} />
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={it.required !== false} onChange={(e) => setItem(i, { required: e.target.checked })} /> required</label>
                  {it.requires_document && (it.form_url ? (
                    <span className="flex items-center gap-1 text-xs rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 max-w-[180px]">
                      <a href={it.form_url} target="_blank" rel="noreferrer" className="truncate hover:underline" title={it.form_name}>{it.form_name || 'Form'}</a>
                      <button title="Remove form" onClick={() => setItem(i, { form_url: null, form_name: null })}><X className="w-3 h-3" /></button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" title="Preload a form from the File Repository" onClick={() => setFormFor(i)}><Paperclip className="w-3.5 h-3.5" /> Form</Button>
                      <label className="inline-flex items-center h-8 px-2 rounded-md text-xs cursor-pointer hover:bg-muted" title="Upload a blank form">
                        {uploading === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => uploadForm(i, e.target.files?.[0])} />
                      </label>
                    </span>
                  ))}
                  {edit.kind === 'onboarding' && it.requires_document && (it.esign_template_id && esignById.get(it.esign_template_id) ? (
                    <button onClick={() => setSignFor(i)} title="Edit where they sign" className="flex items-center gap-1 text-xs rounded bg-violet-50 text-violet-800 border border-violet-200 px-2 py-1">
                      <PenLine className="w-3 h-3" /> E-sign: {(esignById.get(it.esign_template_id).roles || ['Agent']).join(' + ')}
                    </button>
                  ) : it.form_url ? (
                    <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-violet-700" title="Place signature boxes so you can send it for e-signature" onClick={() => setSignFor(i)}><PenLine className="w-3.5 h-3.5" /> Set up e-sign</Button>
                  ) : null)}
                  <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" disabled={i === edit.items.length - 1} onClick={() => move(i, 1)}><ArrowDown className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== i) })}><Trash2 className="w-4 h-4" /></Button>
                </li>
              ))}
            </ul>
            {edit.kind === 'onboarding' && (
              <p className="text-xs text-muted-foreground mt-3 rounded-lg bg-violet-50/60 border border-violet-100 px-3 py-2">
                <PenLine className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-violet-600" />
                For paperwork like an ICA or W-9: attach the blank form (upload or <Paperclip className="w-3 h-3 inline" /> Form), then <b>Set up e-sign</b> and place where the agent signs.
                Keep a <b>Broker</b> signer for forms you countersign (the admin who sends it signs second); remove it for forms only the agent signs.
                Then send it from the agent's onboarding checklist with one tap.
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, items: [...edit.items, { id: uid(), title: '', requires_document: true, required: true }] })}><FileText className="w-4 h-4 mr-1" /> Add document</Button>
              <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, items: [...edit.items, { id: uid(), title: '', requires_document: false, required: true }] })}><CheckSquare className="w-4 h-4 mr-1" /> Add task</Button>
            </div>
            <div className="flex flex-wrap gap-2 mt-6 border-t pt-4">
              <Button onClick={save} disabled={saving || !edit.name?.trim()} className="gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</Button>
              {edit.id && <Button variant="outline" className="gap-1.5" onClick={() => setEdit({ ...structuredClone(edit), id: undefined, name: `${edit.name} (copy)`, items: edit.items.map((x) => ({ ...x, id: uid() })) })}><Copy className="w-4 h-4" /> Duplicate</Button>}
              {edit.id && <Button variant="ghost" className="gap-1.5 text-red-600" onClick={remove}><Trash2 className="w-4 h-4" /> Delete</Button>}
            </div>
          </div>
        )}
      </main>
      {signFor != null && edit?.items[signFor] && <SignSetup item={edit.items[signFor]} template={esignById.get(edit.items[signFor].esign_template_id)} brokerageId={brokerageId} user={user}
        onCreated={async (id) => {
          // Remember the form on the item and save the checklist template right away, so it isn't lost.
          const items = edit.items.map((x, j) => (j === signFor ? { ...x, esign_template_id: id } : x));
          setEdit((e) => ({ ...e, items }));
          if (edit.id) await base44.entities.ChecklistTemplate.update(edit.id, { items }).then(() => queryClient.invalidateQueries({ queryKey: key })).catch(() => {});
        }}
        onClose={() => { setSignFor(null); queryClient.invalidateQueries({ queryKey: ['esign-templates', brokerageId] }); }} />}
      {formFor != null && <LibraryPicker brokerageId={brokerageId} onClose={() => setFormFor(null)}
        onPick={(f) => { setItem(formFor, { form_url: f.file_url, form_name: f.file_name }); setFormFor(null); }} />}
    </div>
  );
}

/** Places the e-sign boxes on an onboarding form. Saved as an e-sign template; the item keeps its id. */
function SignSetup({ item, template, brokerageId, user, onCreated, onClose }) {
  const idRef = React.useRef(template?.id || null);
  const creating = React.useRef(null);
  const save = async (fields, roles) => {
    if (roles.length > 2) throw new Error('Onboarding forms can have the agent and one broker signer.');
    const data = { fields, roles, title: item.title || item.form_name || 'Form', document_url: item.form_url };
    if (!idRef.current) {
      if (!creating.current) creating.current = base44.entities.ESignTemplate.create({ ...data, brokerage_id: brokerageId, created_by_email: user?.email })
        .then(async (t) => { idRef.current = t.id; await onCreated(t.id); return t; });
      await creating.current;
    }
    await base44.entities.ESignTemplate.update(idRef.current, data);
  };
  return <FieldsSetupDialog title={item.title || item.form_name} documentUrl={template?.document_url || item.form_url} fileName={item.form_name} brokerageId={brokerageId}
    initialFields={template?.fields || []} initialRoles={template?.roles} defaultRoles={['Agent', 'Broker']} saved={!!template} onSave={save} onClose={onClose} />;
}
