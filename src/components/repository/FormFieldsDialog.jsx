import React, { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2 } from 'lucide-react';
import ESignFieldEditor, { SIGNER_COLORS } from '@/components/esign/ESignFieldEditor';
import { isPdfUrl } from '@/components/esign/PDFPageRenderer';
import { fieldSignerIndex } from '../../../shared/esignGeometry.js';

const DEFAULT_ROLES = ['Buyer 1', 'Buyer 2', 'Seller 1', 'Seller 2'];

/**
 * Admins set up a library form once: signature, initial, date and fill-in boxes, each for a
 * role (Buyer 1, Seller 1...), plus boxes that fill themselves from the deal. When an agent
 * uses the form from a checklist or the library, everything is already in place.
 * Saved as an e-sign template tied to the file (same document link).
 */
export default function FormFieldsDialog({ file, template, brokerageId, user, onClose }) {
  const queryClient = useQueryClient();
  const [roles, setRoles] = useState(() => (template?.roles?.length ? template.roles : DEFAULT_ROLES));
  const [initialFields, setInitialFields] = useState(() => template?.fields || []);
  const [editorKey, setEditorKey] = useState(0);
  const [status, setStatus] = useState(template ? 'Saved' : 'Not saved yet');
  const idRef = useRef(template?.id || null);
  const creating = useRef(null);
  const latest = useRef(template?.fields || []);
  const rolesRef = useRef(roles);
  rolesRef.current = roles;

  const persist = async (fields, nextRoles = rolesRef.current) => {
    latest.current = fields;
    const data = { fields, roles: nextRoles, title: file.file_name.replace(/\.[^.]+$/, ''), document_url: file.file_url, source_file_id: file.id };
    setStatus('Saving…');
    if (idRef.current) {
      await base44.entities.ESignTemplate.update(idRef.current, data);
    } else {
      if (!creating.current) {
        creating.current = base44.entities.ESignTemplate.create({ ...data, brokerage_id: brokerageId, created_by_email: user?.email })
          .then(async (t) => { idRef.current = t.id; await base44.entities.FileRepository.update(file.id, { esign_template_id: t.id }).catch(() => {}); return t; });
      }
      await creating.current;
      if (latest.current !== fields) return;
    }
    setStatus('Saved');
    queryClient.invalidateQueries({ queryKey: ['library-templates', brokerageId] });
    queryClient.invalidateQueries({ queryKey: ['esign-templates', brokerageId] });
  };

  const renameRole = (i, name) => {
    const next = roles.map((r, j) => (j === i ? name : r));
    setRoles(next);
    persist(latest.current, next).catch(() => setStatus('Could not save'));
  };
  const addRole = () => {
    const next = [...roles, `Signer ${roles.length + 1}`];
    setRoles(next);
    persist(latest.current, next).catch(() => setStatus('Could not save'));
  };
  const removeRole = (i) => {
    const count = latest.current.filter((f) => fieldSignerIndex(f) === i).length;
    if (count && !window.confirm(`Remove ${roles[i]} and their ${count} box${count === 1 ? '' : 'es'}?`)) return;
    const next = roles.filter((_, j) => j !== i);
    const fields = latest.current
      .filter((f) => fieldSignerIndex(f) !== i || f.sender_fill)
      .map((f) => (fieldSignerIndex(f) > i ? { ...f, signer_index: fieldSignerIndex(f) - 1 } : fieldSignerIndex(f) === i ? { ...f, signer_index: 0 } : f));
    setRoles(next);
    setInitialFields(fields);
    setEditorKey((k) => k + 1);
    persist(fields, next).catch(() => setStatus('Could not save'));
  };

  const usable = isPdfUrl(file.file_url) || /\.(png|jpe?g)$/i.test(file.file_name || '');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] max-h-[95vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Set up fields: {file.file_name}</DialogTitle></DialogHeader>
        {!usable ? <p className="text-sm text-muted-foreground">Only PDFs and images can have fields. Upload this form as a PDF.</p> : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium mr-1">Who signs this form</p>
                {roles.map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full border bg-background pl-2 pr-1 py-0.5" style={{ borderColor: SIGNER_COLORS[i % SIGNER_COLORS.length] }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: SIGNER_COLORS[i % SIGNER_COLORS.length] }} />
                    <input value={r} onChange={(e) => renameRole(i, e.target.value.slice(0, 40))} className="bg-transparent text-sm w-24 outline-none" aria-label="Role name" />
                    {roles.length > 1 && <button type="button" onClick={() => removeRole(i)} className="p-0.5 rounded-full hover:bg-muted" aria-label={`Remove ${r}`}><Trash2 className="w-3 h-3" /></button>}
                  </span>
                ))}
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1" onClick={addRole}><Plus className="w-3.5 h-3.5" /> Role</Button>
                <span className="ml-auto text-xs text-muted-foreground">{status}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Pick a role on the right, then place their boxes. Use "Fill from the deal" for boxes like the address and price, and tick
                "Filled in by the agent" on any box the agent should type before sending. Agents fill in real names and emails for each role when they send it;
                roles they don't need (like Buyer 2) are dropped along with their boxes.
              </p>
            </div>
            <ESignFieldEditor key={editorKey} templateMode
              doc={{ id: `tpl-${file.id}`, title: file.file_name, document_url: file.file_url, brokerage_id: brokerageId, signers: roles.map((r) => ({ name: r })), fields: initialFields }}
              persist={persist}
              onChange={(f) => { latest.current = f; }}
              onComplete={() => onClose()} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
