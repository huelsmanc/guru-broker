import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Copy, Share2, Mail, Loader2 } from 'lucide-react';
import { Section } from './ui';

const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');

// Share a read-only progress page with clients (no documents, no money).
export default function WorkspaceShared({ tx, user, refresh, canEdit }) {
  const [busy, setBusy] = useState(false);
  const opts = { dates: true, checklist: true, agent: true, ...(tx.share_options || {}) };
  const link = tx.share_token ? `${window.location.origin}/status?token=${tx.share_token}` : null;
  const { data: clients = [] } = useQuery({
    queryKey: ['tx-contacts', tx.id],
    queryFn: () => base44.entities.TransactionContact.filter({ transaction_id: tx.id }, 'created_date', 200),
    select: (rows) => rows.filter((c) => c.is_client && c.email),
  });

  const update = async (patch) => { await base44.entities.Transaction.update(tx.id, patch); refresh(); };
  const enable = () => update({ share_enabled: true, share_token: tx.share_token || randomToken(), share_options: opts });
  const email = async () => {
    setBusy(true);
    try {
      for (const c of clients) {
        await base44.integrations.Core.SendEmail({
          to: c.email,
          subject: `Track your transaction: ${tx.property_address}`,
          from_name: user.full_name || 'Your agent',
          body: `<p>Hi ${c.name?.split(' ')[0] || 'there'},</p><p>You can follow the progress of ${tx.property_address} here, anytime:</p><p><a href="${link}">${link}</a></p><p>${user.full_name || ''}</p>`,
        });
      }
      window.alert(`Sent to ${clients.length} client${clients.length === 1 ? '' : 's'}.`);
    } catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl">
      <Section title="Shared with clients" subtitle="A read-only page showing progress and key dates. No documents or commission details.">
        {!tx.share_enabled ? (
          <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 p-6">
            <p className="font-semibold text-emerald-800 dark:text-emerald-300 mb-1">This transaction isn't shared yet</p>
            <p className="text-sm text-muted-foreground mb-4">Keep your clients in the loop without extra calls and texts.</p>
            {canEdit && <Button onClick={enable} className="gap-1.5"><Share2 className="w-4 h-4" /> Share</Button>}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input readOnly value={link} className="flex-1 rounded-md border px-3 py-2 text-sm bg-muted/40" />
              <Button variant="outline" onClick={() => navigator.clipboard?.writeText(link)} className="gap-1.5"><Copy className="w-4 h-4" /> Copy</Button>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-2 text-sm">
              <p className="font-medium">What clients can see</p>
              {[['dates', 'Key dates and deadlines'], ['checklist', 'Progress (steps completed)'], ['agent', 'Agent contact info']].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!opts[k]} disabled={!canEdit} onChange={(e) => update({ share_options: { ...opts, [k]: e.target.checked } })} /> {l}</label>
              ))}
            </div>
            {canEdit && <div className="flex flex-wrap gap-2">
              <Button className="gap-1.5" disabled={!clients.length || busy} onClick={email}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Email link to {clients.length || 'no'} client{clients.length === 1 ? '' : 's'}</Button>
              <Button variant="outline" onClick={() => update({ share_enabled: false })}>Stop sharing</Button>
              <Button variant="ghost" onClick={() => update({ share_token: randomToken() })}>New link (old one stops working)</Button>
            </div>}
          </div>
        )}
      </Section>
    </div>
  );
}
