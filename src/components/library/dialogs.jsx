// Library dialogs: add or edit a folder, upload files, rename, move.
import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Lock, Upload, X, Loader2, Check, AlertCircle } from 'lucide-react';
import { Modal, FileGlyph } from './bits';
import { uploadToFolder, sizeText } from './libraryData';
import { useTeam } from '@/components/culture/shared';

const lc = (e) => String(e || '').toLowerCase();
const field = 'w-full rounded-xl border bg-background px-3 py-2.5 text-base md:text-sm outline-none focus:ring-2 focus:ring-primary/30';
const primary = 'rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-50';
const ghost = 'rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-muted';

export function FolderDialog({ folder, brokerageId, user, count, onClose, onSaved }) {
  const [name, setName] = useState(folder?.name || '');
  const [priv, setPriv] = useState(!!folder?.private);
  const [members, setMembers] = useState(folder?.member_emails || []);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { team } = useTeam(user);
  const pick = team.filter((u) => !members.includes(lc(u.email)) && q && `${u.full_name || ''} ${u.display_name || ''} ${u.email}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6);
  const nameOf = (e) => { const u = team.find((x) => lc(x.email) === e); return u?.display_name || u?.full_name || e; };
  const save = async () => {
    if (!name.trim()) return setError('Give the folder a name.');
    setBusy(true); setError('');
    try {
      const data = { name: name.trim().slice(0, 80), private: priv, member_emails: priv ? members : [] };
      const row = folder ? await base44.entities.LibraryFolder.update(folder.id, data)
        : await base44.entities.LibraryFolder.create({ ...data, brokerage_id: brokerageId, sort: (count || 0) + 1, created_by_email: user?.email });
      onSaved(row);
    } catch (err) { setError(err.message || String(err)); setBusy(false); }
  };
  return (
    <Modal title={folder ? 'Edit folder' : 'Add folder'} onClose={onClose}>
      <label className="block text-sm font-medium mb-1.5" htmlFor="folder-name">Folder name</label>
      <input id="folder-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="e.g. Purchase contracts" className={field} />
      <label className="mt-4 flex items-start gap-3 rounded-xl border p-3 cursor-pointer">
        <input type="checkbox" className="mt-1" checked={priv} onChange={(e) => setPriv(e.target.checked)} />
        <span><span className="text-sm font-medium flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Private folder</span>
          <span className="block text-xs text-muted-foreground mt-0.5">Only admins (and anyone you add below) can see it and its files.</span></span>
      </label>
      {priv && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-1.5">Also share with</p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {members.map((e) => (
              <span key={e} className="inline-flex items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 py-0.5 text-xs">{nameOf(e)}
                <button type="button" aria-label={`Remove ${nameOf(e)}`} onClick={() => setMembers(members.filter((x) => x !== e))} className="p-0.5 rounded-full hover:bg-background"><X className="w-3 h-3" /></button></span>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name" className={field} />
          {pick.length > 0 && (
            <ul className="mt-1 rounded-xl border divide-y">
              {pick.map((u) => <li key={u.email}><button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => { setMembers([...members, lc(u.email)]); setQ(''); }}>{u.display_name || u.full_name || u.email}<span className="text-xs text-muted-foreground"> · {u.email}</span></button></li>)}
            </ul>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={ghost} onClick={onClose}>Cancel</button>
        <button type="button" className={primary} disabled={busy} onClick={save}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} {folder ? 'Save' : 'Add folder'}</button>
      </div>
    </Modal>
  );
}

export function UploadDialog({ folders, folderId: startFolder, initialFiles = [], brokerageId, user, onClose, onDone }) {
  const [folderId, setFolderId] = useState(startFolder || folders[0]?.id || '');
  const [files, setFiles] = useState(initialFiles);
  const [state, setState] = useState({});
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const add = (list) => setFiles((cur) => [...cur, ...[...list].filter((f) => f.size <= 50 * 1024 * 1024 && !cur.some((c) => c.name === f.name && c.size === f.size))]);
  const tooBig = (list) => [...list].some((f) => f.size > 50 * 1024 * 1024);
  const start = async () => {
    setBusy(true);
    const made = await uploadToFolder({ files, folderId, brokerageId, user, onEach: (i, s) => setState((m) => ({ ...m, [i]: s })) });
    setBusy(false);
    if (made.length === files.length) onDone(made);
    else onDone(made, true);
  };
  const failed = Object.values(state).some((s) => String(s).startsWith('error'));
  return (
    <Modal title="Upload to the library" onClose={busy ? () => {} : onClose} wide>
      {!folders.length ? <p className="text-sm text-muted-foreground">Add a folder first.</p> : (
        <>
          <label className="block text-sm font-medium mb-1.5" htmlFor="up-folder">Folder</label>
          <select id="up-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)} className={field} disabled={busy}>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}{f.private ? ' (private)' : ''}</option>)}
          </select>
          <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); if (tooBig(e.dataTransfer.files)) window.alert('Files can be up to 50 MB.'); add(e.dataTransfer.files); }}
            onClick={() => !busy && input.current?.click()}
            className={`mt-4 rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${over ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
            <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Drop files here or tap to choose</p>
            <p className="text-xs text-muted-foreground">PDFs can be set up as fillable forms. Up to 50 MB each.</p>
            <input ref={input} type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt,.csv,.zip,application/pdf,image/*"
              onChange={(e) => { if (tooBig(e.target.files)) window.alert('Files can be up to 50 MB.'); add(e.target.files); e.target.value = ''; }} />
          </div>
          {files.length > 0 && (
            <ul className="mt-3 divide-y rounded-xl border">
              {files.map((f, i) => {
                const s = state[i];
                return (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <FileGlyph name={f.name} />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{sizeText(f.size)}</span>
                    {s === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      : s === 'done' ? <Check className="w-4 h-4 text-emerald-600" />
                        : String(s || '').startsWith('error') ? <span title={s}><AlertCircle className="w-4 h-4 text-red-600" /></span>
                          : !busy && <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-muted"><X className="w-3.5 h-3.5" /></button>}
                  </li>
                );
              })}
            </ul>
          )}
          {failed && <p className="mt-2 text-sm text-red-600">Some files didn't upload. Try them again.</p>}
        </>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={ghost} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={primary} disabled={busy || !files.length || !folderId} onClick={start}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Upload{files.length > 1 ? ` ${files.length} files` : ''}
        </button>
      </div>
    </Modal>
  );
}

export function RenameDialog({ file, onClose, onSaved }) {
  const ext = (String(file.file_name).match(/\.[^.]+$/) || [''])[0];
  const [name, setName] = useState(String(file.file_name).slice(0, String(file.file_name).length - ext.length));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { onSaved(await base44.entities.FileRepository.update(file.id, { file_name: `${name.trim()}${ext}` })); }
    catch (err) { window.alert(err.message); setBusy(false); }
  };
  return (
    <Modal title="Rename" onClose={onClose}>
      <div className="flex items-center gap-2">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} className={field} aria-label="File name" />
        {ext && <span className="text-sm text-muted-foreground">{ext}</span>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={ghost} onClick={onClose}>Cancel</button>
        <button type="button" className={primary} disabled={busy || !name.trim()} onClick={save}>Save</button>
      </div>
    </Modal>
  );
}

export function MoveDialog({ file, folders, onClose, onSaved }) {
  const [to, setTo] = useState(file.folder_id || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { onSaved(await base44.entities.FileRepository.update(file.id, { folder_id: to })); }
    catch (err) { window.alert(err.message); setBusy(false); }
  };
  return (
    <Modal title={`Move "${file.file_name}"`} onClose={onClose}>
      <ul className="rounded-xl border divide-y max-h-[50dvh] overflow-y-auto">
        {folders.map((f) => (
          <li key={f.id}>
            <label className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-muted/50">
              <input type="radio" name="move-to" checked={to === f.id} onChange={() => setTo(f.id)} />
              <span className="flex-1">{f.name}</span>{f.private && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
              {f.id === file.folder_id && <span className="text-xs text-muted-foreground">current</span>}
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={ghost} onClick={onClose}>Cancel</button>
        <button type="button" className={primary} disabled={busy || !to || to === file.folder_id} onClick={save}>Move</button>
      </div>
    </Modal>
  );
}
