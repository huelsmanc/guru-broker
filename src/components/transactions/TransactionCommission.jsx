import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { DollarSign, Percent, Save } from 'lucide-react';

export default function TransactionCommission({ tx, isAdmin, onUpdate }) {
  const [form, setForm] = useState({
    commission_sale_price: tx.commission_sale_price ?? tx.sale_price ?? '',
    commission_percentage: tx.commission_percentage ?? '',
    commission_amount: tx.commission_amount ?? '',
    commission_notes: tx.commission_notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  // Auto-calculate commission amount when sale price or percentage changes
  useEffect(() => {
    const price = parseFloat(form.commission_sale_price);
    const pct = parseFloat(form.commission_percentage);
    if (!isNaN(price) && !isNaN(pct)) {
      setForm(f => ({ ...f, commission_amount: ((price * pct) / 100).toFixed(2) }));
    }
  }, [form.commission_sale_price, form.commission_percentage]);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Transaction.update(tx.id, {
      commission_sale_price: form.commission_sale_price ? parseFloat(form.commission_sale_price) : null,
      commission_percentage: form.commission_percentage ? parseFloat(form.commission_percentage) : null,
      commission_amount: form.commission_amount ? parseFloat(form.commission_amount) : null,
      commission_notes: form.commission_notes,
    });
    setSaving(false);
    onUpdate();
  };

  const fmt = (v) => v ? `$${parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <DollarSign className="w-3.5 h-3.5" /> Commission
      </p>

      {isAdmin ? (
        <div className="bg-muted/30 border border-border/40 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
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
              <Label className="text-xs text-muted-foreground">Commission (%)</Label>
              <div className="relative mt-1">
                <Input
                  type="number"
                  step="0.01"
                  value={form.commission_percentage}
                  onChange={e => setForm(f => ({ ...f, commission_percentage: e.target.value }))}
                  placeholder="3.0"
                  className="h-8 text-sm pr-6"
                />
                <Percent className="w-3 h-3 absolute right-2 top-2.5 text-muted-foreground" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Total Commission ($)</Label>
              <Input
                type="number"
                value={form.commission_amount}
                onChange={e => setForm(f => ({ ...f, commission_amount: e.target.value }))}
                placeholder="Auto-calculated"
                className="mt-1 h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Input
              value={form.commission_notes}
              onChange={e => setForm(f => ({ ...f, commission_notes: e.target.value }))}
              placeholder="e.g. split details, referral fee..."
              className="mt-1 h-8 text-sm"
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs gap-1.5">
              <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save Commission'}
            </Button>
          </div>
        </div>
      ) : (
        // Agent read-only view
        tx.commission_amount ? (
          <div className="flex flex-wrap gap-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            {tx.commission_sale_price && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Sale Price</p>
                <p className="text-sm font-semibold text-foreground">{fmt(tx.commission_sale_price)}</p>
              </div>
            )}
            {tx.commission_percentage && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Rate</p>
                <p className="text-sm font-semibold text-foreground">{tx.commission_percentage}%</p>
              </div>
            )}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Your Commission</p>
              <p className="text-lg font-bold text-green-700">{fmt(tx.commission_amount)}</p>
            </div>
            {tx.commission_notes && (
              <div className="w-full">
                <p className="text-xs text-muted-foreground italic">{tx.commission_notes}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Commission not yet entered.</p>
        )
      )}
    </div>
  );
}