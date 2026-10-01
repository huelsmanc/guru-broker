import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Pencil, Mail, Phone, UserPlus, Lock, Users, Save } from 'lucide-react';
import { can } from '../../../shared/permissions.generated.js';
import { Section, Empty } from './ui';
import ContactPicker from '@/components/contacts/ContactPicker';
import { saveToContactBook, roleFor } from '@/lib/contacts';

const ROLES = ['buyer', 'seller', 'tenant', 'landlord', "buyer's agent", "listing agent", 'lender', 'title / closing attorney', 'inspector', 'appraiser', 'attorney', 'other'];

export default function WorkspaceContacts({ tx, user, refresh, canEdit, admin, isOwner }) {
  const queryClient = useQueryClient();
  const key = ['tx-contacts', tx.id];
  const { data: contacts = [] } = useQuery({ queryKey: key, queryFn: () => base44.entities.TransactionContact.filter({ transaction_id: tx.id }, 'created_date', 200) });
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(false);
  const canShare = admin || (isOwner && can(user, 'tx.share'));

  const [picking, setPicking] = useState(false);
  const save = async (c) => {
    const { saveToBook, ...rest } = c;
    const data = { ...rest, transaction_id: tx.id, brokerage_id: tx.brokerage_id, agent_email: String(tx.agent_email || '').toLowerCase(), email: c.email?.trim().toLowerCase() || null };
    // Also keep them in the agent's own contact book (filled in, not duplicated).
    if (saveToBook) {
      const book = await saveToContactBook(user, { ...data, type: data.role, source: 'deal' }).catch(() => null);
      if (book?.id) data.contact_id = book.id;
    }
    if (c.id) await base44.entities.TransactionContact.update(c.id, data); else await base44.entities.TransactionContact.create(data);
    setEditing(null);
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['my-contacts'] });
  };
  const fromBook = (b) => {
    setPicking(false);
    const role = roleFor(b.type);
    setEditing({ name: b.name, email: b.email, phone: b.phone, company: b.company, role, is_client: ['buyer', 'seller', 'tenant', 'landlord'].includes(role), contact_id: b.id });
  };
  const keep = async (c) => {
    const book = await saveToContactBook(user, { ...c, type: c.role, source: 'deal' });
    if (book?.id) await base44.entities.TransactionContact.update(c.id, { contact_id: book.id });
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['my-contacts'] });
  };
  const remove = async (c) => {
    if (!window.confirm(`Remove ${c.name}?`)) return;
    await base44.entities.TransactionContact.delete(c.id);
    queryClient.invalidateQueries({ queryKey: key });
  };
  const removeAgent = async (email) => {
    await base44.entities.Transaction.update(tx.id, { co_agents: (tx.co_agents || []).filter((a) => a.email !== email) });
    refresh();
  };

  return (
    <div className="max-w-4xl">
      <Section title="People on this deal" actions={canShare && <Button variant="outline" className="gap-1.5" onClick={() => setSharing(true)}><UserPlus className="w-4 h-4" /> Add agent</Button>}>
        <ul className="divide-y rounded-xl border bg-card">
          <li className="flex items-center gap-3 px-4 py-3 text-sm"><span className="flex-1">{tx.agent_name || tx.agent_email}</span><span className="text-xs rounded bg-slate-200 px-2 py-0.5">transaction owner</span></li>
          {(tx.co_agents || []).map((a) => (
            <li key={a.email} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex-1">{a.name || a.email}</span><span className="text-xs text-muted-foreground">co-agent{a.split_pct ? ` · ${a.split_pct}%` : ''}</span>
              {canShare && <Button size="icon" variant="ghost" onClick={() => removeAgent(a.email)}><Trash2 className="w-4 h-4" /></Button>}
            </li>
          ))}
          {tx.tc_email && <li className="flex items-center gap-3 px-4 py-3 text-sm"><span className="flex-1">{tx.tc_name || tx.tc_email}</span><span className="text-xs text-muted-foreground">transaction coordinator</span></li>}
        </ul>
        <p className="text-xs text-muted-foreground mt-2">Co-agents see this deal and its contacts. Set commission splits under Finances.</p>
      </Section>

      <Section title={`Contacts (${contacts.length})`} subtitle={<span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Private to the agents on this deal, its TC and admins.</span>}
        actions={canEdit && <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => setPicking((p) => !p)}><Users className="w-4 h-4" /> From my contacts</Button>
          <Button className="gap-1.5" onClick={() => setEditing({ role: 'buyer', is_client: true, saveToBook: true })}><Plus className="w-4 h-4" /> Add contact</Button>
        </div>}>
        {picking && (
          <div className="mb-3 max-w-md">
            <ContactPicker user={user} autoFocus exclude={contacts.map((c) => c.email)} onPick={fromBook}
              onCreateNew={(name) => { setPicking(false); setEditing({ name, role: 'buyer', is_client: true, saveToBook: true }); }} />
          </div>
        )}
        {!contacts.length ? <Empty>No contacts yet. Add the clients, lender, title company and anyone else on the deal.</Empty> : (
          <ul className="divide-y rounded-xl border bg-card">
            {contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-medium">{c.name}{c.is_client && <span className="ml-2 text-[10px] rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5">client</span>}</p>
                  <p className="text-xs text-muted-foreground">{c.role}{c.company ? ` · ${c.company}` : ''}</p>
                </div>
                {c.email && <a href={`mailto:${c.email}`} className="text-xs flex items-center gap-1 text-primary"><Mail className="w-3 h-3" />{c.email}</a>}
                {c.phone && <a href={`tel:${c.phone}`} className="text-xs flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</a>}
                {canEdit && !c.contact_id && <Button size="sm" variant="ghost" className="gap-1 text-xs" title="Save to my contacts" onClick={() => keep(c)}><Save className="w-3.5 h-3.5" /> Save</Button>}
                {canEdit && <><Button size="icon" variant="ghost" onClick={() => setEditing(c)}><Pencil className="w-4 h-4" /></Button><Button size="icon" variant="ghost" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button></>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {editing && <ContactForm contact={editing} onClose={() => setEditing(null)} onSave={save} />}
      {sharing && <ShareAgent tx={tx} onClose={() => setSharing(false)} onDone={() => { setSharing(false); refresh(); }} />}
    </div>
  );
}

function ContactForm({ contact, onClose, onSave }) {
  const [c, setC] = useState(contact);
  const set = (k) => (e) => setC((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{contact.id ? 'Edit contact' : 'Add contact'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input className="mt-1" value={c.name || ''} onChange={set('name')} /></div>
          <div className="col-span-2">
            <Label>Role</Label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={c.role} onChange={set('role')}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div><Label>Email</Label><Input className="mt-1" type="email" value={c.email || ''} onChange={set('email')} /></div>
          <div><Label>Phone</Label><Input className="mt-1" value={c.phone || ''} onChange={set('phone')} /></div>
          <div className="col-span-2"><Label>Company</Label><Input className="mt-1" value={c.company || ''} onChange={set('company')} /></div>
          <div className="col-span-2"><Label>Notes</Label><Input className="mt-1" value={c.notes || ''} onChange={set('notes')} /></div>
          <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.is_client} onChange={set('is_client')} /> Client (gets the CEO thank-you at closing)</label>
          {!c.contact_id && <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.saveToBook} onChange={set('saveToBook')} /> Also save to my contacts</label>}
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!c.name?.trim()} onClick={() => onSave(c)}>Save</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function ShareAgent({ tx, onClose, onDone }) {
  const [users, setUsers] = useState([]);
  const [email, setEmail] = useState('');
  const [split, setSplit] = useState('50');
  useEffect(() => { base44.entities.User.filter({ brokerage_id: tx.brokerage_id }, 'full_name', 1000).then(setUsers).catch(() => {}); }, [tx.brokerage_id]);
  const taken = new Set([tx.agent_email, ...(tx.co_agents || []).map((a) => a.email)].map((e) => String(e).toLowerCase()));
  const add = async () => {
    const u = users.find((x) => x.email === email);
    await base44.entities.Transaction.update(tx.id, { co_agents: [...(tx.co_agents || []), { email: email.toLowerCase(), name: u?.display_name || u?.full_name || email, split_pct: Number(split) || 0 }] });
    onDone();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add an agent to this deal</DialogTitle></DialogHeader>
        <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)}>
          <option value="">Choose an agent</option>
          {users.filter((u) => !taken.has(u.email.toLowerCase()) && !u.suspended).map((u) => <option key={u.id} value={u.email}>{u.display_name || u.full_name || u.email}</option>)}
        </select>
        <div><Label>Their share of the commission (%)</Label><Input className="mt-1" inputMode="decimal" value={split} onChange={(e) => setSplit(e.target.value)} /></div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!email} onClick={add}>Add</Button></div>
      </DialogContent>
    </Dialog>
  );
}
