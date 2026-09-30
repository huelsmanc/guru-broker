import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { can } from '../../../shared/permissions.generated.js';
import { Section, Row, money } from './ui';
import FileCheck from '@/components/transactions/FileCheck';
import TransactionESign from '@/components/transactions/TransactionESign';

const DATES = [
  ['acceptance_date', 'Acceptance'], ['inspection_date', 'Inspection'], ['inspection_contingency_date', 'Inspection contingency'],
  ['appraisal_date', 'Appraisal'], ['financing_contingency_date', 'Financing contingency'], ['loan_approval_date', 'Loan approval'],
  ['title_deadline_date', 'Title commitment'], ['closing_date', 'Closing'],
];
const STATUSES = [['active', 'Active'], ['pending', 'Pending'], ['clear_to_close', 'Clear to close'], ['closed', 'Closed'], ['cancelled', 'Cancelled']];

export default function WorkspaceOverview({ tx, user, refresh, canEdit, admin }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  useEffect(() => {
    setForm({
      property_address: tx.property_address || '', sale_price: tx.sale_price ?? '', status: tx.status || 'active',
      deal_type: tx.deal_type || tx.transaction_type || 'buyer', tc_email: tx.tc_email || '',
      title_company: tx.title_company || '', mls_number: tx.mls_number || '',
      ...Object.fromEntries(DATES.map(([k]) => [k, tx[k] || ''])),
    });
  }, [tx]);
  useEffect(() => {
    if (admin) base44.entities.User.filter({ brokerage_id: tx.brokerage_id }, 'full_name', 1000).then(setUsers).catch(() => {});
  }, [admin, tx.brokerage_id]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const closing = ['closed', 'cancelled'].includes(form.status) && form.status !== tx.status;
  const canClose = admin || can(user, 'tx.close');
  const canReopen = admin || can(user, 'tx.reopen');

  const save = async () => {
    if (closing && !canClose) return window.alert('You need the "close transactions" permission.');
    if (['closed', 'cancelled'].includes(tx.status) && form.status !== tx.status && !canReopen) return window.alert('You need the "re-open transactions" permission.');
    setSaving(true);
    try {
      const tc = users.find((u) => u.email === form.tc_email);
      const patch = { ...form, sale_price: form.sale_price === '' ? null : Number(form.sale_price) };
      for (const [k] of DATES) if (!patch[k]) patch[k] = null;
      if (admin) patch.tc_name = tc ? (tc.display_name || tc.full_name) : form.tc_email ? tx.tc_name : null;
      else delete patch.tc_email;
      if (form.status === 'closed' && !tx.closed_date) patch.closed_date = new Date().toISOString().slice(0, 10);
      await base44.entities.Transaction.update(tx.id, patch);
      refresh();
    } catch (err) {
      window.alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <Section title="Overview" subtitle={`${tx.agent_name || tx.agent_email}${tx.buyers?.length ? ` · Buyer: ${tx.buyers.join(', ')}` : ''}${tx.sellers?.length ? ` · Seller: ${tx.sellers.join(', ')}` : ''}`}
        actions={canEdit && <Button onClick={save} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</Button>}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="sm:col-span-2"><Label>Property</Label><Input className="mt-1" value={form.property_address || ''} onChange={set('property_address')} disabled={!canEdit} /></div>
          <div><Label>Sale price</Label><Input className="mt-1" inputMode="numeric" value={form.sale_price ?? ''} onChange={set('sale_price')} disabled={!canEdit} /></div>
          <div>
            <Label>Status</Label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.status} onChange={set('status')} disabled={!canEdit}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <Label>Deal type</Label>
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.deal_type} onChange={set('deal_type')} disabled={!canEdit}>
              {[['buyer', 'Buyer'], ['listing', 'Listing'], ['dual', 'Dual agent'], ['rental_listing', 'Rental listing'], ['rental_tenant', 'Rental tenant'], ['referral', 'Referral']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <Label>Transaction coordinator</Label>
            {admin ? (
              <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.tc_email} onChange={set('tc_email')}>
                <option value="">None</option>
                {users.map((u) => <option key={u.id} value={u.email}>{u.display_name || u.full_name || u.email}</option>)}
              </select>
            ) : <Input className="mt-1" value={tx.tc_name || tx.tc_email || '-'} disabled />}
          </div>
          <div><Label>MLS #</Label><Input className="mt-1" value={form.mls_number || ''} onChange={set('mls_number')} disabled={!canEdit} /></div>
          <div className="sm:col-span-2"><Label>Title company / closing attorney</Label><Input className="mt-1" value={form.title_company || ''} onChange={set('title_company')} disabled={!canEdit} /></div>
        </div>
      </Section>

      <Section title="Key dates" subtitle="These drive the 48-hour deadline reminders.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DATES.map(([k, l]) => (
            <div key={k}><Label>{l}</Label><Input className="mt-1" type="date" value={form[k] || ''} onChange={set(k)} disabled={!canEdit} /></div>
          ))}
        </div>
      </Section>

      {tx.commission_calc && (
        <Section title="Commission summary">
          <div className="max-w-md">
            <Row label="Gross commission" value={money(tx.commission_calc.gross)} />
            <Row label="Agent net" value={money(tx.commission_calc.agent_net)} strong />
          </div>
        </Section>
      )}

      <Section title="File check"><FileCheck tx={tx} canEdit={canEdit} onUpdate={refresh} /></Section>
      <Section title="E-signatures"><TransactionESign tx={tx} isAdmin={canEdit} user={user} onUpdate={refresh} /></Section>
    </div>
  );
}
