import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Home, Loader2 } from 'lucide-react';

// Links an e-sign document to a deal. The signed copy lands in that deal's Unsorted
// documents (right away if it's already signed), ready to sort onto a checklist.
export default function LinkDealPicker({ doc, brokerageId }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const { data: deals = [] } = useQuery({
    queryKey: ['esign-my-deals', brokerageId],
    enabled: !!brokerageId,
    queryFn: () => base44.entities.Transaction.filter({ brokerage_id: brokerageId }, '-created_date', 200).catch(() => []),
  });
  const change = async (transactionId) => {
    setBusy(true); setNote(null);
    try {
      const r = await base44.functions.invoke('esignLinkDeal', { documentId: doc.id, transactionId: transactionId || null });
      setNote(transactionId ? (r.data?.filed ? "Signed copy added to the deal's Unsorted documents." : 'Linked. The signed copy will go to the deal when everyone signs.') : 'Unlinked.');
      queryClient.invalidateQueries({ queryKey: ['esign-documents'] });
      queryClient.invalidateQueries({ queryKey: ['esign-submissions'] });
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="text-xs">
      <label className="inline-flex items-center gap-1.5 text-muted-foreground">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Home className="w-3.5 h-3.5" />} Deal
        <select className="max-w-[240px] rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground" disabled={busy}
          value={doc.transaction_id || ''} onChange={(e) => change(e.target.value)}>
          <option value="">Not linked</option>
          {deals.map((t) => <option key={t.id} value={t.id}>{t.property_address || 'Untitled deal'}</option>)}
        </select>
      </label>
      {note && <p className="text-muted-foreground mt-1">{note}</p>}
    </div>
  );
}
