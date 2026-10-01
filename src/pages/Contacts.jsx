import React, { useMemo, useRef, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import MobilePageHeader from '@/components/layout/MobilePageHeader';
import UnifiedESignCreator from '@/components/esign/UnifiedESignCreator.jsx';
import { Users, Plus, Search, Mail, Phone, MessageSquare, Trash2, Upload, RefreshCw, Loader2, FileSignature, ClipboardList, Lock, Pencil } from 'lucide-react';
import { CONTACT_TYPES, myContacts, saveToContactBook, roleFor } from '@/lib/contacts';
import { isAdminRole } from '../../shared/permissions.generated.js';
import AddressAutocomplete from '@/components/AddressAutocomplete';

const lc = (v) => String(v || '').trim().toLowerCase();

// Simple CSV reader (handles quoted values with commas and quotes).
function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** People from a CSV export (Google, Outlook, iPhone via a converter, a CRM...). */
function peopleFromCsv(text) {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const h = head.map(lc);
  const col = (...names) => h.findIndex((x) => names.some((n) => x === n || x.includes(n)));
  const iName = col('full name', 'name'); const iFirst = col('first name', 'given name', 'first');
  const iLast = col('last name', 'family name', 'last'); const iEmail = col('e-mail 1 - value', 'email');
  const iPhone = col('phone 1 - value', 'mobile', 'phone'); const iCompany = col('organization name', 'company', 'organization');
  const iType = col('type', 'category', 'role');
  const get = (r, i) => (i >= 0 ? String(r[i] || '').trim() : '');
  return rows.map((r) => ({
    name: get(r, iName) && iName !== iFirst ? get(r, iName) : [get(r, iFirst), get(r, iLast)].filter(Boolean).join(' '),
    email: get(r, iEmail), phone: get(r, iPhone), company: get(r, iCompany),
    type: CONTACT_TYPES.includes(lc(get(r, iType))) ? lc(get(r, iType)) : null,
    source: 'import',
  })).filter((p) => p.name || p.email);
}

export default function Contacts() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role);
  const [everyone, setEveryone] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const fileRef = useRef(null);

  const key = ['contacts-page', user?.email, everyone];
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!user?.email,
    queryFn: () => (everyone && isAdmin ? base44.entities.Contact.filter({ brokerage_id: brokerageId }, 'name', 5000) : myContacts(user, 5000)),
  });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['contacts-page'] });
    queryClient.invalidateQueries({ queryKey: ['my-contacts'] });
  };

  const shown = useMemo(() => {
    const t = lc(q);
    return contacts
      .filter((c) => !type || lc(c.type) === type)
      .filter((c) => !t || [c.name, c.email, c.phone, c.company, c.type, c.notes, ...(c.tags || [])].some((v) => lc(v).includes(t)));
  }, [contacts, q, type]);

  const save = async (c) => {
    const data = {
      name: c.name?.trim(), email: lc(c.email) || null, phone: c.phone?.trim() || null, company: c.company?.trim() || null,
      type: c.type || null, address: c.address?.trim() || null, birthday: c.birthday || null, notes: c.notes || null,
      tags: String(c.tagsText ?? (c.tags || []).join(', ')).split(',').map((x) => x.trim()).filter(Boolean),
    };
    if (c.id) await base44.entities.Contact.update(c.id, data);
    else await base44.entities.Contact.create({ ...data, owner_email: lc(user.email), owner_name: user.full_name || null, brokerage_id: brokerageId, source: 'manual' });
    setEditing(null);
    refresh();
  };
  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name} from your contacts? Deals they're on keep their copy.`)) return;
    await base44.entities.Contact.delete(c.id);
    setOpen(null);
    refresh();
  };

  const importCsv = async (file) => {
    if (!file) return;
    setBusy('import'); setNote(null);
    try {
      const people = peopleFromCsv(await file.text());
      if (!people.length) throw new Error("Couldn't find any names or emails in that file. The first row should be headings like Name, Email, Phone.");
      let list = await myContacts(user, 5000);
      let n = 0;
      for (const p of people) {
        const c = await saveToContactBook(user, p, list);
        if (c && !list.some((x) => x.id === c.id)) { list = [...list, c]; n++; }
      }
      setNote(`Imported ${n} new contact${n === 1 ? '' : 's'} (${people.length - n} already there or updated).`);
      refresh();
    } catch (err) { setNote(err.message); } finally { setBusy(null); }
  };

  // Everyone on the deals this person can see, saved into their contact book once.
  const pullFromDeals = async () => {
    setBusy('pull'); setNote(null);
    try {
      const txs = await base44.entities.Transaction.filter({ brokerage_id: brokerageId }, '-created_date', 1000);
      const mine = txs.filter((t) => [t.agent_email, t.tc_email, ...(t.co_agents || []).map((a) => a.email)].map(lc).includes(lc(user.email)));
      let list = await myContacts(user, 5000);
      let n = 0;
      for (const tx of mine) {
        const people = await base44.entities.TransactionContact.filter({ transaction_id: tx.id }, 'created_date', 200).catch(() => []);
        for (const p of people) {
          if (!p.name && !p.email) continue;
          const c = await saveToContactBook(user, { ...p, type: p.role, source: 'deal' }, list);
          if (!c) continue;
          if (!list.some((x) => x.id === c.id)) { list = [...list, c]; n++; }
          if (!p.contact_id) await base44.entities.TransactionContact.update(p.id, { contact_id: c.id }).catch(() => {});
        }
      }
      setNote(`Added ${n} new contact${n === 1 ? '' : 's'} from ${mine.length} deal${mine.length === 1 ? '' : 's'}.`);
      refresh();
    } catch (err) { setNote(err.message); } finally { setBusy(null); }
  };

  return (
    <>
      <MobilePageHeader title="Contacts" />
      <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Users className="w-7 h-7 text-primary" />
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold">Contacts</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1"><Lock className="w-3 h-3" /> Your clients and partners. Private to you{isAdmin ? '' : ' and your brokerage admins'}.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; importCsv(f); }} />
            <Button variant="outline" className="gap-1.5" disabled={!!busy} onClick={pullFromDeals}>
              {busy === 'pull' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Add from my deals
            </Button>
            <Button variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import CSV
            </Button>
            <Button className="gap-1.5" onClick={() => setEditing({ type: 'buyer' })}><Plus className="w-4 h-4" /> Add contact</Button>
          </div>
        </div>
        {note && <p className="text-sm rounded-lg border bg-muted/40 px-3 py-2">{note}</p>}

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5 flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone, company, tag" className="h-10 w-full bg-transparent text-sm outline-none" />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
            <option value="">All types</option>
            {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {isAdmin && (
            <label className="text-sm flex items-center gap-1.5"><input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} /> Everyone's contacts</label>
          )}
        </div>

        {isLoading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground mx-auto" /> : !shown.length ? (
          <div className="text-center py-16 rounded-2xl border bg-card">
            <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground">{contacts.length ? 'No one matches.' : 'No contacts yet. Add one, import a CSV, or pull everyone from your deals.'}</p>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card divide-y">
            {shown.map((c) => (
              <button key={c.id} type="button" onClick={() => setOpen(c)} className="w-full text-left flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/40">
                <span className="w-9 h-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center flex-shrink-0">{String(c.name || '?').slice(0, 1).toUpperCase()}</span>
                <span className="flex-1 min-w-[160px]">
                  <span className="block font-medium">{c.name}</span>
                  <span className="block text-xs text-muted-foreground">{[c.type, c.company].filter(Boolean).join(' · ')}{everyone && c.owner_email !== lc(user.email) ? ` · ${c.owner_name || c.owner_email}'s` : ''}</span>
                </span>
                <span className="text-xs text-muted-foreground hidden sm:block w-56 truncate">{c.email}</span>
                <span className="text-xs text-muted-foreground hidden md:block w-32 truncate">{c.phone}</span>
                {(c.tags || []).slice(0, 2).map((t) => <span key={t} className="text-[10px] rounded-full bg-muted px-2 py-0.5">{t}</span>)}
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{shown.length} of {contacts.length} shown</p>
      </div>

      {editing && <ContactForm contact={editing} onClose={() => setEditing(null)} onSave={save} />}
      {open && (
        <ContactDetail contact={contacts.find((c) => c.id === open.id) || open} user={user} brokerageId={brokerageId}
          onClose={() => setOpen(null)} onEdit={(c) => { setOpen(null); setEditing(c); }} onDelete={remove} />
      )}
    </>
  );
}

export function ContactForm({ contact, onClose, onSave }) {
  const [c, setC] = useState({ ...contact, tagsText: (contact.tags || []).join(', ') });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{contact.id ? 'Edit contact' : 'Add contact'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input className="mt-1" value={c.name || ''} onChange={set('name')} autoFocus /></div>
          <div><Label>Email</Label><Input className="mt-1" type="email" value={c.email || ''} onChange={set('email')} /></div>
          <div><Label>Phone</Label><Input className="mt-1" value={c.phone || ''} onChange={set('phone')} /></div>
          <div>
            <Label>Type</Label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.type || ''} onChange={set('type')}>
              <option value="">-</option>
              {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><Label>Company</Label><Input className="mt-1" value={c.company || ''} onChange={set('company')} /></div>
          <div className="col-span-2"><Label>Address</Label><AddressAutocomplete className="mt-1" value={c.address || ''} onChange={(v) => set('address')({ target: { value: v } })} placeholder="Start typing an address" /></div>
          <div><Label>Birthday</Label><Input className="mt-1" type="date" value={c.birthday || ''} onChange={set('birthday')} /></div>
          <div><Label>Tags (comma separated)</Label><Input className="mt-1" value={c.tagsText} onChange={set('tagsText')} placeholder="sphere, 2026 buyer" /></div>
          <div className="col-span-2"><Label>Notes</Label><textarea className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={3} value={c.notes || ''} onChange={set('notes')} /></div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!c.name?.trim() || saving} onClick={async () => { setSaving(true); try { await onSave(c); } catch (err) { window.alert(err.message); } finally { setSaving(false); } }}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactDetail({ contact: c, user, brokerageId, onClose, onEdit, onDelete }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [dealId, setDealId] = useState('');
  const [role, setRole] = useState(roleFor(c.type));
  const [signing, setSigning] = useState(false);
  const [msg, setMsg] = useState(null);

  // Deals this person is on (linked from the contact book, or with the same email).
  const { data: onDeals = [] } = useQuery({
    queryKey: ['contact-deals', c.id],
    queryFn: async () => {
      const byId = await base44.entities.TransactionContact.filter({ contact_id: c.id }, '-created_date', 100).catch(() => []);
      const byEmail = c.email ? await base44.entities.TransactionContact.filter({ email: lc(c.email) }, '-created_date', 100).catch(() => []) : [];
      const rows = [...byId, ...byEmail.filter((r) => !byId.some((x) => x.id === r.id))];
      const txIds = [...new Set(rows.map((r) => r.transaction_id))];
      const txs = await Promise.all(txIds.map((id) => base44.entities.Transaction.get(id).catch(() => null)));
      return rows.map((r) => ({ ...r, tx: txs.find((t) => t?.id === r.transaction_id) })).filter((r) => r.tx);
    },
  });
  const { data: deals = [] } = useQuery({
    queryKey: ['esign-my-deals', brokerageId],
    enabled: adding,
    queryFn: () => base44.entities.Transaction.filter({ brokerage_id: brokerageId }, '-created_date', 200).catch(() => []),
  });

  const addToDeal = async () => {
    const tx = deals.find((t) => t.id === dealId);
    if (!tx) return;
    await base44.entities.TransactionContact.create({
      transaction_id: tx.id, brokerage_id: tx.brokerage_id, agent_email: lc(tx.agent_email),
      name: c.name, email: lc(c.email) || null, phone: c.phone || null, company: c.company || null,
      role, is_client: ['buyer', 'seller', 'tenant', 'landlord'].includes(role), contact_id: c.id,
    });
    setAdding(false); setDealId(''); setMsg(`Added to ${tx.property_address || 'the deal'}.`);
    queryClient.invalidateQueries({ queryKey: ['contact-deals', c.id] });
    queryClient.invalidateQueries({ queryKey: ['tx-contacts', tx.id] });
  };
  const digits = String(c.phone || '').replace(/[^\d+]/g, '');

  return (
    <>
      <Dialog open={!signing} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{c.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">{[c.type, c.company].filter(Boolean).join(' · ') || 'Contact'}</p>
            <div className="flex flex-wrap gap-2">
              {c.email && <a href={`mailto:${c.email}`}><Button variant="outline" size="sm" className="gap-1.5"><Mail className="w-4 h-4" /> Email</Button></a>}
              {digits && <a href={`tel:${digits}`}><Button variant="outline" size="sm" className="gap-1.5"><Phone className="w-4 h-4" /> Call</Button></a>}
              {digits && <a href={`sms:${digits}`}><Button variant="outline" size="sm" className="gap-1.5"><MessageSquare className="w-4 h-4" /> Text</Button></a>}
              <Button variant="outline" size="sm" className="gap-1.5" disabled={!c.email} title={c.email ? '' : 'Add an email first'} onClick={() => setSigning(true)}><FileSignature className="w-4 h-4" /> Send for signature</Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdding((a) => !a)}><ClipboardList className="w-4 h-4" /> Add to a deal</Button>
            </div>
            {adding && (
              <div className="rounded-lg border p-3 space-y-2">
                <select className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm" value={dealId} onChange={(e) => setDealId(e.target.value)}>
                  <option value="">Choose a deal</option>
                  {deals.map((t) => <option key={t.id} value={t.id}>{t.property_address || 'Untitled deal'}{t.status ? ` (${t.status})` : ''}</option>)}
                </select>
                <select className="w-full rounded-md border border-input bg-background px-2 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
                  {['buyer', 'seller', 'tenant', 'landlord', "buyer's agent", 'listing agent', 'lender', 'title / closing attorney', 'inspector', 'appraiser', 'attorney', 'other'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <Button size="sm" disabled={!dealId} onClick={addToDeal}>Add</Button>
              </div>
            )}
            {msg && <p className="text-green-700">{msg}</p>}
            <dl className="grid grid-cols-[90px_1fr] gap-y-1.5">
              {c.email && <><dt className="text-muted-foreground">Email</dt><dd className="break-all">{c.email}</dd></>}
              {c.phone && <><dt className="text-muted-foreground">Phone</dt><dd>{c.phone}</dd></>}
              {c.address && <><dt className="text-muted-foreground">Address</dt><dd>{c.address}</dd></>}
              {c.birthday && <><dt className="text-muted-foreground">Birthday</dt><dd>{c.birthday}</dd></>}
              {(c.tags || []).length > 0 && <><dt className="text-muted-foreground">Tags</dt><dd>{c.tags.join(', ')}</dd></>}
              {c.notes && <><dt className="text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap">{c.notes}</dd></>}
            </dl>
            <div>
              <p className="font-medium mb-1">Deals</p>
              {!onDeals.length ? <p className="text-muted-foreground text-xs">Not on any of your deals yet.</p> : (
                <ul className="space-y-1">
                  {onDeals.map((r) => (
                    <li key={r.id}><Link to={`/Transactions/${r.tx.id}`} className="text-primary hover:underline">{r.tx.property_address || 'Deal'}</Link> <span className="text-xs text-muted-foreground">· {r.role}{r.tx.status ? ` · ${r.tx.status}` : ''}</span></li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-between pt-2 border-t">
              <Button variant="ghost" size="sm" className="text-destructive gap-1.5" onClick={() => onDelete(c)}><Trash2 className="w-4 h-4" /> Delete</Button>
              <Button size="sm" className="gap-1.5" onClick={() => onEdit(c)}><Pencil className="w-4 h-4" /> Edit</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={signing} onOpenChange={(o) => !o && setSigning(false)}>
        <DialogContent className="w-[95vw] max-w-[95vw] h-[95dvh] max-h-[95dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Send to {c.name} for signature</DialogTitle></DialogHeader>
          <UnifiedESignCreator initialSigners={[{ id: `c-${c.id}`, name: c.name, email: lc(c.email) }]}
            onCancel={() => setSigning(false)} onComplete={() => { setSigning(false); setMsg('Sent for signature.'); }} />
        </DialogContent>
      </Dialog>
    </>
  );
}
