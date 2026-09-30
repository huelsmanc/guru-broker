import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DollarSign, Save, Send } from 'lucide-react';

export default function CommissionBreakdown({ tx, isAdmin, onUpdate }) {
  const [form, setForm] = useState({
    commission_sale_price: tx.commission_sale_price ?? tx.sale_price ?? '',
    commission_type: tx.commission_type ?? 'percentage',
    commission_percentage: tx.commission_percentage ?? '',
    commission_flat: tx.commission_flat ?? '',
    commission_amount: tx.commission_amount ?? '',
    brokerage_fee_type: tx.brokerage_fee_type ?? 'percentage',
    brokerage_fee_percentage: tx.brokerage_fee_percentage ?? '',
    brokerage_fee_flat: tx.brokerage_fee_flat ?? '',
    brokerage_fee: tx.brokerage_fee ?? '',
    transaction_fee_type: tx.transaction_fee_type ?? 'percentage',
    transaction_fee_percentage: tx.transaction_fee_percentage ?? '',
    transaction_fee_flat: tx.transaction_fee_flat ?? '',
    transaction_fee: tx.transaction_fee ?? '',
    commission_notes: tx.commission_notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Calculate agent net
  const calcAgentNet = () => {
    const comm = parseFloat(form.commission_amount) || 0;
    const broker = parseFloat(form.brokerage_fee) || 0;
    const txFee = parseFloat(form.transaction_fee) || 0;
    return (comm - broker - txFee).toFixed(2);
  };

  // Auto-calculate amounts based on type
  useEffect(() => {
    const price = parseFloat(form.commission_sale_price);
    let commAmount = 0;

    if (form.commission_type === 'percentage') {
      const pct = parseFloat(form.commission_percentage);
      if (!isNaN(price) && !isNaN(pct)) {
        commAmount = (price * pct) / 100;
      }
    } else {
      commAmount = parseFloat(form.commission_flat) || 0;
    }

    let brokerFee = 0;
    if (form.brokerage_fee_type === 'percentage') {
      const pct = parseFloat(form.brokerage_fee_percentage);
      if (!isNaN(commAmount) && !isNaN(pct)) {
        brokerFee = (commAmount * pct) / 100;
      }
    } else {
      brokerFee = parseFloat(form.brokerage_fee_flat) || 0;
    }

    let txFee = 0;
    if (form.transaction_fee_type === 'percentage') {
      const pct = parseFloat(form.transaction_fee_percentage);
      if (!isNaN(commAmount) && !isNaN(pct)) {
        txFee = (commAmount * pct) / 100;
      }
    } else {
      txFee = parseFloat(form.transaction_fee_flat) || 0;
    }

    const agentNet = commAmount - brokerFee - txFee;

    setForm(f => ({
      ...f,
      commission_amount: commAmount.toFixed(2),
      brokerage_fee: brokerFee.toFixed(2),
      transaction_fee: txFee.toFixed(2),
    }));
  }, [form.commission_sale_price, form.commission_type, form.commission_percentage, form.commission_flat, 
      form.brokerage_fee_type, form.brokerage_fee_percentage, form.brokerage_fee_flat,
      form.transaction_fee_type, form.transaction_fee_percentage, form.transaction_fee_flat]);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Transaction.update(tx.id, {
      commission_sale_price: form.commission_sale_price ? parseFloat(form.commission_sale_price) : null,
      commission_type: form.commission_type,
      commission_percentage: form.commission_percentage ? parseFloat(form.commission_percentage) : null,
      commission_flat: form.commission_flat ? parseFloat(form.commission_flat) : null,
      commission_amount: form.commission_amount ? parseFloat(form.commission_amount) : null,
      brokerage_fee_type: form.brokerage_fee_type,
      brokerage_fee_percentage: form.brokerage_fee_percentage ? parseFloat(form.brokerage_fee_percentage) : null,
      brokerage_fee_flat: form.brokerage_fee_flat ? parseFloat(form.brokerage_fee_flat) : null,
      brokerage_fee: form.brokerage_fee ? parseFloat(form.brokerage_fee) : null,
      transaction_fee_type: form.transaction_fee_type,
      transaction_fee_percentage: form.transaction_fee_percentage ? parseFloat(form.transaction_fee_percentage) : null,
      transaction_fee_flat: form.transaction_fee_flat ? parseFloat(form.transaction_fee_flat) : null,
      transaction_fee: form.transaction_fee ? parseFloat(form.transaction_fee) : null,
      commission_notes: form.commission_notes,
    });
    setSaving(false);
    onUpdate();
  };

  const handleSendStatement = async () => {
    setSending(true);
    await base44.functions.invoke('sendCommissionStatement', {
      transactionId: tx.id,
      agentEmail: tx.agent_email,
      agentName: tx.agent_name,
      propertyAddress: tx.property_address,
      salePrice: form.commission_sale_price,
      commissionAmount: form.commission_amount,
      brokerageFee: form.brokerage_fee,
      transactionFee: form.transaction_fee,
      agentNet: calcAgentNet(),
    });
    setSending(false);
  };

  const fmt = (v) => v ? `$${parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <DollarSign className="w-3.5 h-3.5" /> Commission
      </p>

      {isAdmin ? (
        <div className="bg-muted/30 border border-border/40 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Sale Price ($)</Label>
              <Input
                type="number"
                value={form.commission_sale_price}
                onChange={e => setForm(f => ({ ...f, commission_sale_price: e.target.value }))}
                placeholder="450000"
                className="mt-1 h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Commission ($)</Label>
              <Input
                type="number"
                value={form.commission_amount}
                onChange={e => setForm(f => ({ ...f, commission_amount: e.target.value }))}
                placeholder="Auto-calculated"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Commission</Label>
              <select
                value={form.commission_type}
                onChange={e => setForm(f => ({ ...f, commission_type: e.target.value }))}
                className="w-full mt-1 h-8 px-2 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="percentage">% Percentage</option>
                <option value="flat">$ Flat Amount</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{form.commission_type === 'percentage' ? 'Rate (%)' : 'Amount ($)'}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.commission_type === 'percentage' ? form.commission_percentage : form.commission_flat}
                onChange={e => setForm(f => ({ ...f, [f.commission_type === 'percentage' ? 'commission_percentage' : 'commission_flat']: e.target.value }))}
                placeholder="0.00"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Brokerage Fee</Label>
              <select
                value={form.brokerage_fee_type}
                onChange={e => setForm(f => ({ ...f, brokerage_fee_type: e.target.value }))}
                className="w-full mt-1 h-8 px-2 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="percentage">% Percentage</option>
                <option value="flat">$ Flat Amount</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{form.brokerage_fee_type === 'percentage' ? 'Rate (%)' : 'Amount ($)'}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.brokerage_fee_type === 'percentage' ? form.brokerage_fee_percentage : form.brokerage_fee_flat}
                onChange={e => setForm(f => ({ ...f, [f.brokerage_fee_type === 'percentage' ? 'brokerage_fee_percentage' : 'brokerage_fee_flat']: e.target.value }))}
                placeholder="0.00"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Transaction Fee</Label>
              <select
                value={form.transaction_fee_type}
                onChange={e => setForm(f => ({ ...f, transaction_fee_type: e.target.value }))}
                className="w-full mt-1 h-8 px-2 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="percentage">% Percentage</option>
                <option value="flat">$ Flat Amount</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{form.transaction_fee_type === 'percentage' ? 'Rate (%)' : 'Amount ($)'}</Label>
              <Input
                type="number"
                step="0.01"
                value={form.transaction_fee_type === 'percentage' ? form.transaction_fee_percentage : form.transaction_fee_flat}
                onChange={e => setForm(f => ({ ...f, [f.transaction_fee_type === 'percentage' ? 'transaction_fee_percentage' : 'transaction_fee_flat']: e.target.value }))}
                placeholder="0.00"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Input
              value={form.commission_notes}
              onChange={e => setForm(f => ({ ...f, commission_notes: e.target.value }))}
              placeholder="Optional notes..."
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Commission</p>
                <p className="text-sm font-bold text-foreground">{fmt(form.commission_amount)}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fees</p>
                <p className="text-sm font-bold text-orange-600">{fmt((parseFloat(form.brokerage_fee) || 0) + (parseFloat(form.transaction_fee) || 0))}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Agent Net</p>
                <p className="text-lg font-bold text-green-700">{fmt(calcAgentNet())}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button 
              size="sm" 
              variant="outline"
              onClick={handleSendStatement} 
              disabled={sending || tx.status !== 'closed'} 
              className="h-7 text-xs gap-1.5"
            >
              <Send className="w-3 h-3" /> {sending ? 'Sending...' : 'Send Statement'}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs gap-1.5">
              <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      ) : (
        // Agent read-only view
        tx.commission_amount ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Commission</p>
                <p className="text-lg font-bold text-green-700">{fmt(tx.commission_amount)}</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Fees</p>
                <p className="text-lg font-bold text-orange-600">{fmt((parseFloat(tx.brokerage_fee) || 0) + (parseFloat(tx.transaction_fee) || 0))}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Your Net</p>
                <p className="text-lg font-bold text-blue-700">{fmt((parseFloat(tx.commission_amount) || 0) - (parseFloat(tx.brokerage_fee) || 0) - (parseFloat(tx.transaction_fee) || 0))}</p>
              </div>
            </div>
            {tx.commission_notes && (
              <p className="text-xs text-muted-foreground italic">{tx.commission_notes}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Commission not yet entered.</p>
        )
      )}
    </div>
  );
}