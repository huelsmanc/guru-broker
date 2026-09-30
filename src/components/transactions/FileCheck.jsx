import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Loader2, Plus } from 'lucide-react';

const TONE = {
  critical: 'border-red-300 bg-red-50 text-red-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-900',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

// "AI file check": reviews the transaction and lists what's missing or at risk.
export default function FileCheck({ tx, canEdit, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('aiFileCheck', { transactionId: tx.id });
      setResult(res.data.result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addTask = async (title) => {
    const checklist = [...(tx.checklist || []), { id: Date.now().toString(), title, completed: false, completed_by: null, completed_at: null }];
    await base44.entities.Transaction.update(tx.id, { checklist });
    onUpdate?.();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> File check
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />} {result ? 'Check again' : 'Check this file with AI'}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && (
        <div className="space-y-2">
          <p className="text-sm"><span className="font-semibold">{result.score}/100</span> · {result.headline}</p>
          {result.items.map((it, i) => (
            <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${TONE[it.severity] || TONE.info}`}>
              <p className="font-semibold">{it.title}</p>
              <p>{it.detail}</p>
              {canEdit && it.suggested_task && (
                <button className="mt-1 inline-flex items-center gap-1 underline" onClick={() => addTask(it.suggested_task)}>
                  <Plus className="w-3 h-3" /> Add to checklist: {it.suggested_task}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
