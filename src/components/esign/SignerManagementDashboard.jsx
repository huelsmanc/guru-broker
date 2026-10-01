import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, ArrowUp, ArrowDown, UserPlus, CheckCircle2, Clock } from 'lucide-react';
import { SIGNER_COLORS } from './ESignFieldEditor';
import ContactPicker from '@/components/contacts/ContactPicker';
import { saveToContactBook } from '@/lib/contacts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const newId = () => `signer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/**
 * Who signs. Each row is one signer, in signing order (used when "sign in order" is on).
 * transactionId: offers the deal's people (contacts, agent, TC) as one-tap adds.
 * me: the sender, so they can add themselves.
 * Rows from a template keep their role ("Buyer 1") until a real person is filled in.
 * Without onSignersChange the list is read-only (shows who has signed).
 */
export default function SignerManagementDashboard({ document, submissions = [], onSignersChange, initialSigners = [], transactionId, me }) {
  const [signers, setSigners] = useState(() => (initialSigners.length ? initialSigners : document?.signers || []).map((s) => ({ id: s.id || newId(), ...s })));
  const [draft, setDraft] = useState({ email: '', name: '' });
  const readOnly = !onSignersChange;

  useEffect(() => { onSignersChange?.(signers); }, [signers, onSignersChange]);

  const txId = transactionId || document?.transaction_id;
  const { data: dealPeople = [] } = useQuery({
    queryKey: ['esign-deal-people', txId],
    enabled: !!txId && !readOnly,
    queryFn: async () => {
      const [tx, contacts] = await Promise.all([
        base44.entities.Transaction.get(txId).catch(() => null),
        base44.entities.TransactionContact.filter({ transaction_id: txId }, 'created_date', 50).catch(() => []),
      ]);
      const out = [];
      for (const c of contacts || []) if (c.email) out.push({ name: c.name || '', email: c.email, role: c.role || 'Contact' });
      if (tx?.agent_email) out.push({ name: tx.agent_name || '', email: tx.agent_email, role: 'Agent' });
      if (tx?.tc_email) out.push({ name: tx.tc_name || '', email: tx.tc_email, role: 'TC' });
      // Buyers/sellers named on the deal without an email: offer them so only the email is needed.
      const known = new Set(out.map((p) => String(p.name).toLowerCase()));
      for (const n of (tx?.buyers || []).filter(Boolean)) if (!known.has(String(n).toLowerCase())) out.push({ name: n, email: '', role: 'Buyer' });
      for (const n of (tx?.sellers || []).filter(Boolean)) if (!known.has(String(n).toLowerCase())) out.push({ name: n, email: '', role: 'Seller' });
      return out;
    },
  });

  const statusOf = (email) => {
    const sub = submissions.find((s) => s.document_id === document?.id);
    const s = sub?.signers?.find((x) => x.email === email);
    return s?.signed ? 'signed' : 'waiting';
  };

  const add = (p) => {
    // Fill the first empty template role before adding a new row.
    setSigners((prev) => {
      const open = prev.findIndex((s) => !s.email);
      if (open >= 0 && p.email) return prev.map((s, i) => (i === open ? { ...s, name: p.name || s.name, email: p.email } : s));
      return [...prev, { id: newId(), name: p.name || '', email: p.email || '', role: p.role === 'Me' ? undefined : p.role }];
    });
  };
  const addDraft = () => {
    if (!EMAIL.test(draft.email.trim())) return;
    const person = { email: draft.email.trim(), name: draft.name.trim() || draft.email.split('@')[0] };
    add(person);
    if (me?.email) saveToContactBook(me, { ...person, source: 'e-sign' }).catch(() => {});
    setDraft({ email: '', name: '' });
  };
  const update = (id, patch) => setSigners((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id) => setSigners((prev) => prev.filter((s) => s.id !== id));
  const move = (i, d) => setSigners((prev) => {
    const j = i + d;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const already = new Set(signers.map((s) => String(s.email || '').toLowerCase()).filter(Boolean));
  const offers = [
    ...(me?.email ? [{ name: me.full_name || '', email: me.email, role: 'Me' }] : []),
    ...dealPeople,
  ].filter((p) => !p.email || !already.has(p.email.toLowerCase()));

  return (
    <div className="space-y-5">
      {!readOnly && offers.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">{txId ? 'From this deal' : 'Quick add'}</p>
          <div className="flex flex-wrap gap-2">
            {offers.map((p, i) => (
              <button key={`${p.email}-${p.name}-${i}`} type="button"
                onClick={() => (p.email ? add(p) : setDraft({ email: '', name: p.name }))}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:border-primary hover:text-primary">
                <UserPlus className="w-3.5 h-3.5" />
                <span className="font-medium">{p.name || p.email}</span>
                <span className="text-muted-foreground">· {p.role}{p.email ? '' : ' (add email)'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2">
          <p className="text-sm font-semibold">Add someone</p>
          {me?.email && (
            <ContactPicker user={me} placeholder="Search your contacts" exclude={signers.map((s) => s.email)}
              onPick={(c) => (c.email ? add({ name: c.name, email: c.email }) : setDraft({ name: c.name, email: '' }))}
              onCreateNew={(text) => setDraft(text.includes('@') ? { name: '', email: text } : { name: text, email: '' })} />
          )}
          <p className="text-xs text-muted-foreground">Or type a new person (they're saved to your contacts):</p>
          <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
            <Input placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} className="h-9" />
            <Input type="email" placeholder="Email address" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft(); } }} className="h-9" />
            <Button type="button" onClick={addDraft} disabled={!EMAIL.test(draft.email.trim())} className="gap-1.5 h-9"><Plus className="w-4 h-4" /> Add</Button>
          </div>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold mb-2">Signers ({signers.length})</p>
        {signers.length === 0 ? (
          <div className="text-center py-8 bg-muted/30 rounded-lg border border-border/40 text-sm text-muted-foreground">No one added yet</div>
        ) : (
          <div className="space-y-2">
            {signers.map((s, i) => {
              const color = SIGNER_COLORS[i % SIGNER_COLORS.length];
              const badEmail = !s.email || !EMAIL.test(s.email);
              return (
                <div key={s.id} className="bg-card border border-border rounded-lg p-3 flex items-center gap-3" style={{ borderLeft: `4px solid ${color}` }}>
                  <span className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0" style={{ background: color }}>{i + 1}</span>
                  <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-2">
                    <div>
                      {s.role && <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.role}</p>}
                      <input value={s.name || ''} disabled={readOnly} onChange={(e) => update(s.id, { name: e.target.value })} placeholder="Name"
                        className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background" />
                    </div>
                    <div className="self-end">
                      <input type="email" value={s.email || ''} disabled={readOnly} onChange={(e) => update(s.id, { email: e.target.value.trim() })} placeholder="Email"
                        className={`w-full px-2 py-1.5 text-sm border rounded bg-background ${badEmail && !readOnly ? 'border-amber-400' : 'border-border'}`} />
                    </div>
                  </div>
                  {readOnly ? (
                    statusOf(s.email) === 'signed'
                      ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                      : <Clock className="w-5 h-5 text-amber-500" />
                  ) : (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1.5 rounded hover:bg-muted disabled:opacity-30" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === signers.length - 1} className="p-1.5 rounded hover:bg-muted disabled:opacity-30" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
                      <button type="button" onClick={() => remove(s.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!readOnly && signers.length > 1 && <p className="text-xs text-muted-foreground mt-2">This is the signing order if you choose "Sign in order" when sending. Place fields after the order is set.</p>}
      </div>
    </div>
  );
}
