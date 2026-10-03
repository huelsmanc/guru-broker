// Company library: the brokerage's forms and files in folders. Library managers add folders (private
// ones for admins and chosen people), upload, set forms up for e-sign (who signs, where, and what fills
// in from the deal), rename, copy, move and delete. Everyone can preview, download and send a form
// for signature; deals and checklists pick forms from here.
import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import {
  Library as LibraryIcon, FolderPlus, Upload, Search, X, ChevronRight, Folder, FolderOpen, Lock, MoreHorizontal, Pencil, Trash2,
  Copy, FolderInput, Download, PenTool, ArrowLeft, Loader2, FileSignature, FilePlus,
} from 'lucide-react';
import MobilePageHeader from '@/components/layout/MobilePageHeader';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import UnifiedESignCreator from '@/components/esign/UnifiedESignCreator';
import { useLibrary, canManageLibrary, isPdfName, pagesText, downloadUrl, sizeText } from '@/components/library/libraryData';
import { Menu, FileGlyph } from '@/components/library/bits';
import { FolderDialog, UploadDialog, RenameDialog, MoveDialog } from '@/components/library/dialogs';
import FilePreview from '@/components/library/FilePreview';
import LibraryFormEditor from '@/components/library/LibraryFormEditor';

const OPEN_KEY = 'gbh-library-open';
const readOpen = () => { try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'); } catch { return []; } };
const writeOpen = (ids) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify(ids)); } catch { /* private mode */ } };

export default function Library() {
  const { user, brokerageId: ctxBrokerage } = useOutletContext();
  const brokerageId = ctxBrokerage || user?.brokerage_id;
  const manage = canManageLibrary(user);
  const { folders, files, formOf, refresh, loading } = useLibrary(brokerageId);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('file');
  const selected = files.find((f) => f.id === selectedId) || null;
  const select = (f) => { const p = new URLSearchParams(params); if (f) p.set('file', f.id); else p.delete('file'); setParams(p, { replace: !f }); };

  const [q, setQ] = useState('');
  const [open, setOpen] = useState(readOpen);
  const [dialog, setDialog] = useState(null); // { kind, ... }
  const [editing, setEditing] = useState(null);
  const [signing, setSigning] = useState(null);
  const [dropOn, setDropOn] = useState(null);

  // The selected file's folder opens by itself.
  useEffect(() => { if (selected?.folder_id && !open.includes(selected.folder_id)) setOpen((o) => [...o, selected.folder_id]); }, [selected?.folder_id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => writeOpen(open), [open]);
  const toggle = (id) => setOpen((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));

  const needle = q.trim().toLowerCase();
  const inFolder = useMemo(() => {
    const m = new Map(folders.map((f) => [f.id, []]));
    const loose = [];
    for (const f of files) {
      if (needle && !`${f.file_name} ${f.description || ''}`.toLowerCase().includes(needle)) continue;
      (m.get(f.folder_id) || loose).push(f);
    }
    return { m, loose };
  }, [folders, files, needle]);
  const shownFolders = needle ? folders.filter((f) => (inFolder.m.get(f.id) || []).length || f.name.toLowerCase().includes(needle)) : folders;

  const act = async (label, fn) => {
    try { await fn(); } catch (err) { window.alert(`${label}: ${err.message || err}`); }
  };
  const removeFile = (f) => act('Could not delete', async () => {
    if (!window.confirm(`Delete "${f.file_name}"? Its form setup goes too.`)) return;
    await base44.functions.invoke('library', { action: 'delete_file', id: f.id });
    if (selectedId === f.id) select(null);
    refresh();
  });
  const duplicate = (f) => act('Could not copy', async () => {
    const { data } = await base44.functions.invoke('library', { action: 'duplicate', id: f.id });
    refresh();
    if (data?.file) select(data.file);
  });
  const removeFolder = (folder) => act('Could not delete the folder', async () => {
    const n = (files.filter((f) => f.folder_id === folder.id)).length;
    if (!window.confirm(n ? `Delete "${folder.name}" and the ${n} file${n === 1 ? '' : 's'} in it?` : `Delete "${folder.name}"?`)) return;
    await base44.functions.invoke('library', { action: 'delete_folder', id: folder.id });
    if (selected?.folder_id === folder.id) select(null);
    refresh();
  });
  const savePages = (f, n) => { if (manage && n && f.pages !== n) base44.entities.FileRepository.update(f.id, { pages: n }).then(refresh).catch(() => {}); };

  const folderOf = (f) => folders.find((x) => x.id === f?.folder_id);
  const pdf = (f) => isPdfName(f?.file_name) || /\.pdf(\?|$)/i.test(f?.file_url || '');

  return (
    <>
      <MobilePageHeader title="Library" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div className="min-w-0">
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight flex items-center gap-2.5"><LibraryIcon className="w-7 h-7 text-primary" /> Company library</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Forms, contracts and documents for your deals and checklists.</p>
          </div>
          {manage && (
            <div className="flex gap-2">
              <button onClick={() => setDialog({ kind: 'folder' })} className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium hover:bg-muted"><FolderPlus className="w-4 h-4" /> Add folder</button>
              <button onClick={() => setDialog({ kind: 'upload' })} disabled={!folders.length} className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"><Upload className="w-4 h-4" /> Upload</button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-5 items-start">
          {/* Folders and files */}
          <div className="min-w-0">
            <div className="relative mb-3">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the library" aria-label="Search the library"
                className="w-full rounded-full border bg-card pl-10 pr-9 py-2.5 text-base md:text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              {q && <button aria-label="Clear search" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-muted"><X className="w-3.5 h-3.5" /></button>}
            </div>

            {loading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              : !folders.length && !files.length ? (
                <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
                  <FolderOpen className="w-10 h-10 mx-auto text-muted-foreground/40" />
                  <p className="font-medium mt-3">{manage ? 'Start your library' : 'Nothing in the library yet'}</p>
                  <p className="text-sm text-muted-foreground mt-1">{manage ? 'Add a folder (like "Purchase contracts" or "Onboarding"), then upload your forms.' : 'Your broker will add forms and documents here.'}</p>
                  {manage && <button onClick={() => setDialog({ kind: 'folder' })} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"><FolderPlus className="w-4 h-4" /> Add folder</button>}
                </div>
              ) : (
                <div className="rounded-2xl border bg-card overflow-hidden divide-y">
                  {shownFolders.map((folder) => {
                    const list = inFolder.m.get(folder.id) || [];
                    const total = files.filter((f) => f.folder_id === folder.id).length;
                    const isOpen = !!needle || open.includes(folder.id);
                    const Icon = isOpen ? FolderOpen : Folder;
                    return (
                      <div key={folder.id}
                        onDragOver={manage ? (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDropOn(folder.id); } } : undefined}
                        onDragLeave={manage ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropOn(null); } : undefined}
                        onDrop={manage ? (e) => { e.preventDefault(); setDropOn(null); if (e.dataTransfer.files.length) setDialog({ kind: 'upload', folderId: folder.id, files: [...e.dataTransfer.files] }); } : undefined}
                        className={dropOn === folder.id ? 'bg-primary/5 ring-2 ring-inset ring-primary' : ''}>
                        <div className="flex items-center gap-1 pr-2 hover:bg-muted/40">
                          <button onClick={() => toggle(folder.id)} aria-expanded={isOpen} className="flex-1 min-w-0 flex items-center gap-2.5 pl-3 py-3 text-left">
                            <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                            <span className="relative shrink-0">
                              <Icon className="w-5 h-5 text-amber-500" fill="currentColor" fillOpacity={0.18} />
                              {folder.private && <Lock className="absolute -bottom-1 -right-1 w-3 h-3 p-[1px] rounded-full bg-card text-foreground" />}
                            </span>
                            <span className="font-medium truncate">{folder.name}</span>
                            <span className="ml-1 shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">{needle ? `${list.length}/${total}` : total}</span>
                            {folder.private && <span className="hidden sm:inline text-[11px] text-muted-foreground">Private</span>}
                          </button>
                          {manage && (
                            <Menu label={`${folder.name} options`} trigger={<MoreHorizontal className="w-4 h-4" />} items={[
                              { label: 'Upload to folder', icon: Upload, onClick: () => setDialog({ kind: 'upload', folderId: folder.id }) },
                              { label: 'Edit folder', icon: Pencil, onClick: () => setDialog({ kind: 'folder', folder }) },
                              '-',
                              { label: 'Delete folder', icon: Trash2, danger: true, onClick: () => removeFolder(folder) },
                            ]} />
                          )}
                        </div>
                        {isOpen && (
                          <ul className="pb-1.5">
                            {list.map((f) => <FileRow key={f.id} f={f} active={f.id === selectedId} form={formOf(f)} manage={manage} onClick={() => select(f)} />)}
                            {!list.length && (
                              <li className="pl-12 pr-4 py-2.5 text-sm text-muted-foreground">
                                {needle ? 'No matches in this folder.' : manage ? <button className="inline-flex items-center gap-1.5 text-primary hover:underline" onClick={() => setDialog({ kind: 'upload', folderId: folder.id })}><FilePlus className="w-4 h-4" /> Upload files, or drop them here</button> : 'Empty folder.'}
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {inFolder.loose.length > 0 && (
                    <div>
                      <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not in a folder</p>
                      <ul className="pb-1.5">{inFolder.loose.map((f) => <FileRow key={f.id} f={f} active={f.id === selectedId} form={formOf(f)} manage={manage} onClick={() => select(f)} />)}</ul>
                    </div>
                  )}
                  {needle && !shownFolders.length && !inFolder.loose.length && <p className="p-6 text-center text-sm text-muted-foreground">Nothing matches "{q}".</p>}
                </div>
              )}
          </div>

          {/* Preview: beside the list on a computer, full screen on a phone. */}
          <div className={selected ? 'fixed inset-0 z-[70] bg-background flex flex-col lg:static lg:z-auto lg:bg-transparent lg:block' : 'hidden lg:block'}>
            {selected ? (
              <div className="flex flex-col min-h-0 h-full lg:h-auto lg:sticky lg:top-4 lg:rounded-2xl lg:border lg:bg-card lg:overflow-hidden">
                <div className="border-b bg-card px-3 sm:px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 lg:pt-3">
                  <div className="flex items-start gap-2">
                    <button onClick={() => select(null)} aria-label="Close preview" className="lg:hidden -ml-1 p-2 rounded-full hover:bg-muted"><ArrowLeft className="w-5 h-5" /></button>
                    <div className="min-w-0 flex-1 pt-1 lg:pt-0">
                      <p className="font-semibold leading-snug break-words">{selected.file_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[folderOf(selected)?.name, pagesText(selected.pages), sizeText(selected.file_size), selected.uploaded_by_name && `added by ${selected.uploaded_by_name}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button onClick={() => select(null)} aria-label="Close preview" className="hidden lg:flex p-1.5 rounded-full hover:bg-muted"><X className="w-4 h-4" /></button>
                  </div>
                  <FormStatus form={formOf(selected)} pdf={pdf(selected)} manage={manage} />
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {manage && pdf(selected) && (
                      <button onClick={() => setEditing(selected)} className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3.5 py-1.5 text-sm font-medium"><PenTool className="w-4 h-4" /> Edit form</button>
                    )}
                    {pdf(selected) && (
                      <button onClick={() => setSigning(selected)} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium ${manage ? 'border hover:bg-muted' : 'bg-primary text-primary-foreground'}`}><FileSignature className="w-4 h-4" /> Send for signature</button>
                    )}
                    <a href={downloadUrl(selected.file_url)} className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm hover:bg-muted"><Download className="w-4 h-4" /> Download</a>
                    {manage && (
                      <div className="ml-auto">
                        <Menu label="File options" trigger={<MoreHorizontal className="w-4 h-4" />} items={[
                          { label: 'Rename', icon: Pencil, onClick: () => setDialog({ kind: 'rename', file: selected }) },
                          { label: 'Make a copy', icon: Copy, onClick: () => duplicate(selected) },
                          { label: 'Move to folder', icon: FolderInput, onClick: () => setDialog({ kind: 'move', file: selected }) },
                          '-',
                          { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeFile(selected) },
                        ]} />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto bg-muted/40 lg:max-h-[calc(100dvh-14rem)]">
                  <FilePreview file={selected} onPages={(n) => savePages(selected, n)} />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed bg-card/60 p-10 text-center text-sm text-muted-foreground">
                <FileGlyph name="x.pdf" className="w-10 h-10 mx-auto mb-3 opacity-60" />
                Pick a file to preview it.
              </div>
            )}
          </div>
        </div>
      </div>

      {dialog?.kind === 'folder' && <FolderDialog folder={dialog.folder} brokerageId={brokerageId} user={user} count={folders.length} onClose={() => setDialog(null)}
        onSaved={(f) => { setDialog(null); refresh(); if (f?.id && !open.includes(f.id)) setOpen((o) => [...o, f.id]); }} />}
      {dialog?.kind === 'upload' && <UploadDialog folders={folders} folderId={dialog.folderId} initialFiles={dialog.files} brokerageId={brokerageId} user={user} onClose={() => setDialog(null)}
        onDone={(made, partly) => { refresh(); if (!partly) setDialog(null); if (made[0]) { setOpen((o) => (o.includes(made[0].folder_id) ? o : [...o, made[0].folder_id])); select(made[0]); } }} />}
      {dialog?.kind === 'rename' && <RenameDialog file={dialog.file} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); refresh(); }} />}
      {dialog?.kind === 'move' && <MoveDialog file={dialog.file} folders={folders} onClose={() => setDialog(null)} onSaved={(f) => { setDialog(null); refresh(); if (f?.folder_id) setOpen((o) => (o.includes(f.folder_id) ? o : [...o, f.folder_id])); }} />}
      {editing && <LibraryFormEditor file={editing} form={formOf(editing)} brokerageId={brokerageId} user={user} onClose={() => { setEditing(null); refresh(); }} />}
      <Dialog open={!!signing} onOpenChange={(o) => !o && setSigning(null)}>
        <DialogContent className="w-[95vw] max-w-[95vw] h-[95dvh] max-h-[95dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Send for signature: {signing?.file_name}</DialogTitle></DialogHeader>
          {signing && <UnifiedESignCreator user={user} brokerageId={brokerageId} initialTitle={signing.file_name.replace(/\.[^.]+$/, '')} initialDocumentUrl={signing.file_url}
            onCancel={() => setSigning(null)} onComplete={() => setSigning(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function FileRow({ f, active, form, manage, onClick }) {
  const ready = (form?.fields || []).length > 0;
  return (
    <li>
      <button onClick={onClick} className={`w-full flex items-center gap-2.5 pl-10 sm:pl-12 pr-4 py-2 text-left transition-colors ${active ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
        <FileGlyph name={f.file_name} />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm truncate ${active ? 'font-medium text-primary' : ''}`}>{f.file_name}</span>
          <span className="block text-[11px] text-muted-foreground">{[pagesText(f.pages), ready ? 'Form ready' : manage && isPdfName(f.file_name) ? 'No fields yet' : ''].filter(Boolean).join(' · ') || ' '}</span>
        </span>
        {ready && <FileSignature className="w-3.5 h-3.5 shrink-0 text-emerald-600" aria-label="Form ready" />}
      </button>
    </li>
  );
}

function FormStatus({ form, pdf, manage }) {
  if (!pdf) return null;
  const fields = form?.fields || [];
  if (!fields.length) {
    return manage ? <p className="mt-2 text-xs text-muted-foreground">No fields yet. Use Edit form to add signatures, initials and boxes that fill in from the deal.</p> : null;
  }
  const roles = (form.roles || []).filter(Boolean);
  const auto = fields.filter((x) => x.deal_key).length;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 font-medium"><FileSignature className="w-3 h-3" /> Form ready</span>
      <span className="text-muted-foreground">{fields.length} field{fields.length === 1 ? '' : 's'}{auto ? ` · ${auto} fill from the deal` : ''}{roles.length ? ` · ${roles.join(', ')}` : ''}{form.role_order ? ' · signs in order' : ''}</span>
    </div>
  );
}
