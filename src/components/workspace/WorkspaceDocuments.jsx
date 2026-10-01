import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, FileText, Download, Trash2, ScanLine } from 'lucide-react';
import { Section, Empty, Pill } from './ui';
import ScanContractButton from '@/components/transactions/ScanContractButton';
import SignedDownload, { isSignedLink } from '@/components/esign/SignedDownload';

// Every document on the deal: checklist uploads plus "unsorted" files that aren't on a
// checklist yet (assign them to an item from here).
export default function WorkspaceDocuments({ tx, user, refresh, canEdit }) {
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const { data: lists = [] } = useQuery({
    queryKey: ['checklists', 'transaction', tx.id],
    queryFn: () => base44.entities.Checklist.filter({ subject_type: 'transaction', subject_id: tx.id }, 'created_date', 50),
  });
  const fromChecklists = lists.flatMap((l) => (l.items || []).filter((i) => i.document_url).map((i) => ({ ...i, checklist: l })));
  const unsorted = (tx.documents || []).map((d, idx) => ({ ...d, idx }));

  const upload = async (files) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const docs = [...(tx.documents || [])];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file, scope: { kind: 'tx', id: tx.id } });
        docs.push({ name: file.name, url: file_url, uploaded_at: new Date().toISOString(), uploaded_by: user.full_name || user.email });
      }
      await base44.entities.Transaction.update(tx.id, { documents: docs });
      refresh();
    } catch (err) { window.alert(err.message); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const assign = async (doc, value) => {
    if (!value) return;
    const [checklistId, itemId] = value.split('|');
    try {
      await base44.functions.invoke('checklistAction', { action: 'attach', checklist_id: checklistId, item_id: itemId, url: doc.url, name: doc.name });
      const docs = (tx.documents || []).filter((_, i) => i !== doc.idx);
      await base44.entities.Transaction.update(tx.id, { documents: docs });
      queryClient.invalidateQueries({ queryKey: ['checklists', 'transaction', tx.id] });
      refresh();
    } catch (err) { window.alert(err.message); }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Remove "${doc.name}" from this deal?`)) return;
    await base44.entities.Transaction.update(tx.id, { documents: (tx.documents || []).filter((_, i) => i !== doc.idx) });
    refresh();
  };

  const openItems = lists.flatMap((l) => (l.items || []).filter((i) => i.requires_document && !['approved', 'exempt'].includes(i.status)).map((i) => ({ l, i })));

  return (
    <div className="max-w-5xl">
      <Section title="Documents" subtitle={`${fromChecklists.length} on checklists · ${unsorted.length} unsorted`}
        actions={canEdit && <>
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => upload([...e.target.files])} />
          <Button variant="outline" className="gap-1.5" onClick={() => setShowScan((s) => !s)}><ScanLine className="w-4 h-4" /> Scan with AI</Button>
          <Button className="gap-1.5" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Add document</Button>
        </>}>
        {showScan && <div className="mb-4 max-w-md"><ScanContractButton scope={{ kind: 'tx', id: tx.id }} label="Scan a contract to check it and pull dates" /></div>}

        <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Unsorted</h3>
        {unsorted.length === 0 ? <Empty>Nothing unsorted. New uploads land here until you assign them to a checklist item.</Empty> : (
          <ul className="divide-y rounded-xl border bg-card mb-6">
            {unsorted.map((d) => (
              <li key={d.idx} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <a href={d.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-sm hover:underline">{d.name}</a>
                {canEdit && openItems.length > 0 && (
                  <select className="rounded-md border border-input bg-background px-2 py-1 text-xs max-w-[220px]" defaultValue="" onChange={(e) => assign(d, e.target.value)}>
                    <option value="">Assign to…</option>
                    {openItems.map(({ l, i }) => <option key={i.id} value={`${l.id}|${i.id}`}>{l.name}: {i.title}</option>)}
                  </select>
                )}
                {isSignedLink(d.url) ? <SignedDownload url={d.url} iconOnly className="border-0 h-9 w-9 justify-center" />
                  : <a href={d.url} download><Button size="icon" variant="ghost"><Download className="w-4 h-4" /></Button></a>}
                {canEdit && <Button size="icon" variant="ghost" onClick={() => remove(d)}><Trash2 className="w-4 h-4" /></Button>}
              </li>
            ))}
          </ul>
        )}

        <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2 mt-6">On checklists</h3>
        {fromChecklists.length === 0 ? <Empty>No checklist documents yet.</Empty> : (
          <ul className="divide-y rounded-xl border bg-card">
            {fromChecklists.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <a href={d.document_url} target="_blank" rel="noreferrer" className="block truncate text-sm hover:underline">{d.title}</a>
                  <p className="text-xs text-muted-foreground truncate">{d.document_name} · {d.checklist.name}</p>
                </div>
                {isSignedLink(d.document_url) && <SignedDownload url={d.document_url} iconOnly className="border-0 h-9 w-9 justify-center" />}
                <Pill status={d.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
