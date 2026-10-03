// "Edit form" for a library file, like Brokermint's: first who fills and signs it (roles, the agent
// filling things in before sending, signing order), then the boxes on the pages. Saved as the form's
// e-sign template, so deals, checklists and "Send for signature" use it as is.
import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Plus, X, Loader2, ChevronDown, Download, Printer, Undo2, Check } from 'lucide-react';
import ESignFieldEditor, { SIGNER_COLORS } from '@/components/esign/ESignFieldEditor';
import { fieldSignerIndex } from '../../../shared/esignGeometry.js';
import { Menu } from './bits';
import { downloadUrl } from './libraryData';

const PRESETS = [
  { label: 'Buyers', roles: ['Buyer 1', 'Buyer 2'] },
  { label: 'Sellers', roles: ['Seller 1', 'Seller 2'] },
  { label: 'Buyers & sellers', roles: ['Buyer 1', 'Buyer 2', 'Seller 1', 'Seller 2'] },
  { label: 'Agent & broker', roles: ['Agent', 'Broker'] },
];

export default function LibraryFormEditor({ file, form, brokerageId, user, onClose }) {
  const original = useRef({ fields: form?.fields || [], roles: form?.roles?.length ? form.roles : ['Buyer 1', 'Buyer 2'], role_order: !!form?.role_order, initiator: form?.initiator !== false, existed: !!form?.id });
  const [step, setStep] = useState((form?.fields || []).length ? 'fields' : 'roles');
  const [roles, setRoles] = useState(original.current.roles);
  const [roleOrder, setRoleOrder] = useState(original.current.role_order);
  const [initiator, setInitiator] = useState(original.current.initiator);
  const [startFields, setStartFields] = useState(original.current.fields);
  const [editorKey, setEditorKey] = useState(0);
  const [status, setStatus] = useState(form?.id ? 'Saved' : '');
  const [closing, setClosing] = useState(false);
  const latest = useRef(original.current.fields);
  const idRef = useRef(form?.id || null);
  const creating = useRef(null);
  const queue = useRef(Promise.resolve());
  const settings = useRef({ roles, roleOrder, initiator });
  settings.current = { roles, roleOrder, initiator };

  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, []);

  // Saved as the e-sign template tied to the file (one per file).
  const write = async (fields, s) => {
    const data = { fields, roles: s.roles, role_order: s.roleOrder, initiator: s.initiator, title: file.file_name.replace(/\.[^.]+$/, ''), document_url: file.file_url, source_file_id: file.id };
    if (!idRef.current) {
      creating.current ||= base44.entities.ESignTemplate.create({ ...data, brokerage_id: brokerageId, created_by_email: user?.email })
        .then(async (t) => { idRef.current = t.id; await base44.entities.FileRepository.update(file.id, { esign_template_id: t.id }).catch(() => {}); return t; });
      await creating.current;
    }
    await base44.entities.ESignTemplate.update(idRef.current, data);
  };
  const persist = (fields, s = settings.current) => {
    latest.current = fields;
    setStatus('Saving…');
    queue.current = queue.current.catch(() => {}).then(() => write(fields, s)).then(() => setStatus('Saved'), (err) => { setStatus('Could not save'); throw err; });
    return queue.current;
  };
  const saveSettings = (patch) => {
    const s = { ...settings.current, ...patch };
    if (idRef.current || latest.current.length) persist(latest.current, s).catch(() => {});
  };

  // Roles: boxes follow their role when roles are removed or reordered.
  const remap = (fields) => { latest.current = fields; setStartFields(fields); setEditorKey((k) => k + 1); };
  const rename = (i, name) => { const next = roles.map((r, j) => (j === i ? name : r)); setRoles(next); saveSettings({ roles: next }); };
  const add = () => { const next = [...roles, `Signer ${roles.length + 1}`]; setRoles(next); saveSettings({ roles: next }); };
  const remove = (i) => {
    const count = latest.current.filter((f) => fieldSignerIndex(f) === i && !f.sender_fill).length;
    if (count && !window.confirm(`Remove ${roles[i]} and their ${count} box${count === 1 ? '' : 'es'}?`)) return;
    const next = roles.filter((_, j) => j !== i);
    const fields = latest.current.filter((f) => f.sender_fill || f.type === 'strike' || fieldSignerIndex(f) !== i)
      .map((f) => (fieldSignerIndex(f) > i ? { ...f, signer_index: fieldSignerIndex(f) - 1 } : fieldSignerIndex(f) === i ? { ...f, signer_index: 0 } : f));
    setRoles(next); remap(fields);
    persist(fields, { ...settings.current, roles: next }).catch(() => {});
  };
  const move = (i, j) => {
    if (j < 0 || j >= roles.length) return;
    const next = [...roles]; [next[i], next[j]] = [next[j], next[i]];
    const fields = latest.current.map((f) => (f.sender_fill ? f : fieldSignerIndex(f) === i ? { ...f, signer_index: j } : fieldSignerIndex(f) === j ? { ...f, signer_index: i } : f));
    setRoles(next); remap(fields);
    persist(fields, { ...settings.current, roles: next }).catch(() => {});
  };
  const preset = (list) => { setRoles(list); saveSettings({ roles: list }); };

  const saveAndClose = async () => {
    setClosing(true);
    try { await persist(latest.current); onClose(); } catch (err) { window.alert(`Could not save: ${err.message || err}`); setClosing(false); }
  };
  const discard = async () => {
    if (!window.confirm('Discard the changes you made since opening this form?')) return;
    setClosing(true);
    try {
      await queue.current.catch(() => {});
      const o = original.current;
      if (!o.existed && idRef.current) {
        await base44.entities.ESignTemplate.delete(idRef.current).catch(() => {});
        await base44.entities.FileRepository.update(file.id, { esign_template_id: null }).catch(() => {});
      } else if (idRef.current) await write(o.fields, { roles: o.roles, roleOrder: o.role_order, initiator: o.initiator });
      onClose();
    } catch (err) { window.alert(err.message); setClosing(false); }
  };

  const named = roles.map((r) => String(r || '').trim()).filter(Boolean);
  const valid = named.length === roles.length && roles.length > 0;

  return (
    <div className="fixed inset-0 z-[75] bg-background flex flex-col" role="dialog" aria-label={`Edit form: ${file.file_name}`}>
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b px-2 sm:px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        {step === 'fields'
          ? <button onClick={() => setStep('roles')} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-sm hover:bg-muted"><ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Roles</span></button>
          : <button onClick={saveAndClose} aria-label="Close" className="p-2 rounded-full hover:bg-muted"><X className="w-5 h-5" /></button>}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Edit form · {step === 'roles' ? 'Step 1 of 2' : 'Step 2 of 2'}<span className="hidden sm:inline">: {step === 'roles' ? 'roles' : 'fields'}</span></p>
          <p className="text-sm font-medium truncate">{file.file_name}</p>
        </div>
        {status && <span className={`hidden sm:inline text-xs ${status === 'Could not save' ? 'text-red-600' : 'text-muted-foreground'}`}>{status === 'Saved' ? <><Check className="inline w-3 h-3 mr-0.5" />Saved</> : status}</span>}
        {step === 'fields' && (
          <div className="flex items-center rounded-full bg-primary text-primary-foreground">
            <button onClick={saveAndClose} disabled={closing} className="inline-flex items-center gap-1.5 pl-4 pr-2 py-2 text-sm font-medium disabled:opacity-60">{closing && <Loader2 className="w-4 h-4 animate-spin" />} Save &amp; close</button>
            <span className="w-px h-5 bg-primary-foreground/30" />
            <div className="[&_button]:text-primary-foreground [&_button:hover]:bg-white/10">
              <Menu label="More save options" trigger={<ChevronDown className="w-4 h-4" />} items={[
                { label: 'Download blank form', icon: Download, onClick: () => { window.location.href = downloadUrl(file.file_url); } },
                { label: 'Open to print', icon: Printer, onClick: () => window.open(file.file_url, '_blank', 'noopener') },
                '-',
                { label: 'Discard changes', icon: Undo2, danger: true, onClick: discard },
              ]} />
            </div>
          </div>
        )}
      </div>

      {step === 'roles' ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-lg px-4 py-6 sm:py-10">
            <h2 className="text-xl font-bold tracking-tight">Who fills in and signs this form?</h2>
            <p className="text-sm text-muted-foreground mt-1">Roles are placeholders. When an agent sends the form, they put real names and emails on each role, and roles they don't need (like Buyer 2) drop off with their boxes.</p>

            <label className="mt-5 flex items-start gap-3 rounded-2xl border bg-card p-4 cursor-pointer">
              <button type="button" role="switch" aria-checked={initiator} onClick={() => { setInitiator(!initiator); saveSettings({ initiator: !initiator }); }}
                className={`relative mt-0.5 shrink-0 w-11 h-6 rounded-full transition-colors ${initiator ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${initiator ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
              <span>
                <span className="text-sm font-medium">The agent fills in some fields before sending</span>
                <span className="block text-xs text-muted-foreground mt-0.5">Adds a "Fill when sending" role for things like the price, names and dates. Boxes tied to the deal fill themselves in.</span>
              </span>
            </label>

            <div className="mt-5 rounded-2xl border bg-card">
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <p className="text-sm font-semibold">Signers</p>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roleOrder} onChange={(e) => { setRoleOrder(e.target.checked); saveSettings({ roleOrder: e.target.checked }); }} /> Sign in this order</label>
              </div>
              <ul className="px-2 pb-2">
                {roles.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted/50">
                    {roleOrder ? <span className="w-5 text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span> : null}
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: SIGNER_COLORS[i % SIGNER_COLORS.length] }} />
                    <input value={r} onChange={(e) => rename(i, e.target.value.slice(0, 40))} aria-label={`Role ${i + 1} name`} placeholder="Role name"
                      className="min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-1.5 text-base md:text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                    {roleOrder && (
                      <>
                        <button type="button" aria-label={`Move ${r} up`} disabled={i === 0} onClick={() => move(i, i - 1)} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                        <button type="button" aria-label={`Move ${r} down`} disabled={i === roles.length - 1} onClick={() => move(i, i + 1)} className="p-1.5 rounded-md hover:bg-muted disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                      </>
                    )}
                    <button type="button" aria-label={`Remove ${r}`} disabled={roles.length === 1} onClick={() => remove(i)} className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-30"><X className="w-4 h-4" /></button>
                  </li>
                ))}
              </ul>
              <div className="border-t px-4 py-2.5 flex flex-wrap items-center gap-2">
                <button type="button" onClick={add} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><Plus className="w-4 h-4" /> Add role</button>
                {!latest.current.length && (
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => <button key={p.label} type="button" onClick={() => preset(p.roles)} className="rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted">{p.label}</button>)}
                  </span>
                )}
              </div>
            </div>
            {roleOrder && <p className="text-xs text-muted-foreground mt-2">Each signer gets the form after the one before them has signed.</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={saveAndClose} className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-muted">Close</button>
              <button type="button" disabled={!valid} onClick={() => { setEditorKey((k) => k + 1); setStartFields(latest.current); setStep('fields'); }}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-medium disabled:opacity-50">Next <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ESignFieldEditor key={editorKey} variant="toolbar" templateMode initiator={initiator}
            doc={{ id: `library-${file.id}`, title: file.file_name, document_url: file.file_url, brokerage_id: brokerageId, signers: roles.map((r) => ({ name: r })), fields: startFields }}
            persist={(f) => persist(f)} onChange={(f) => { latest.current = f; }} />
        </div>
      )}
    </div>
  );
}
