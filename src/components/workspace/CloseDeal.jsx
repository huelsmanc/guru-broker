import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { postUpdate } from '@/lib/dealActions';
import { todayStr } from '../../../shared/dealTimeline.js';

const DONE = ['approved', 'exempt', 'done'];

/**
 * Close the deal. Unfinished checklist items are shown as a heads-up and never block it:
 * whoever can close deals can always close (the override is noted on the deal's updates).
 */
export default function CloseDeal({ tx, user, items = [], onClose, onClosed, goFinances, canSeeFinances }) {
  const open = items.filter((i) => !DONE.includes(i.status));
  const [date, setDate] = useState(String(tx.closing_date || '').slice(0, 10) || todayStr());
  const [price, setPrice] = useState(tx.sale_price ?? '');
  const [anyway, setAnyway] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const close = async () => {
    setBusy(true); setError('');
    try {
      const patch = { status: 'closed', closed_date: date };
      if (price !== '' && Number(price) > 0) patch.sale_price = Number(price);
      await base44.entities.Transaction.update(tx.id, patch);
      const extra = open.length ? ` Closed with ${open.length} checklist item${open.length === 1 ? '' : 's'} still open${note.trim() ? `: ${note.trim()}` : '.'}` : note.trim() ? ` ${note.trim()}` : '';
      await postUpdate({ ...tx, ...patch }, user, `Deal closed on ${date}.${extra}`, { milestone: 'Closed', ...(open.length ? { override: true, open_items: open.length } : {}) }).catch(() => {});
      base44.functions.invoke('notifyTransactionActivity', { type: 'update_posted', transaction: { ...tx, ...patch }, update: { message: 'Deal closed', milestone: 'Closed' } }).catch(() => {});
      setDone(true);
      onClosed?.();
    } catch (e) {
      setError(e.message || 'Could not close the deal.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{done ? 'Deal closed' : 'Close this deal'}</DialogTitle></DialogHeader>
        {done ? (
          <div className="space-y-3 text-sm">
            <p className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" /> {tx.property_address} is closed and counts on the sales leaderboard.</p>
            {open.length > 0 && <p className="text-muted-foreground">The {open.length} open checklist item{open.length === 1 ? '' : 's'} stay on the checklist so they can still be finished.</p>}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Done</Button>
              {canSeeFinances && <Button onClick={() => { onClose(); goFinances(); }}>Calculate commission</Button>}
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Closing date</Label><Input type="date" className="mt-1.5" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><Label>Final sale price</Label><Input inputMode="decimal" className="mt-1.5" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="470000" /></div>
            </div>
            {open.length > 0 ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2 text-sm text-amber-900">
                <p className="font-medium flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {open.length} checklist item{open.length === 1 ? ' isn\'t' : 's aren\'t'} finished</p>
                <ul className="list-disc pl-5 text-xs space-y-0.5">
                  {open.slice(0, 6).map((i) => <li key={i.id}>{i.title}{i.status && i.status !== 'open' ? ` (${String(i.status).replace(/_/g, ' ')})` : ''}</li>)}
                  {open.length > 6 && <li>and {open.length - 6} more</li>}
                </ul>
                <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={anyway} onChange={(e) => setAnyway(e.target.checked)} /> Close anyway</label>
                {anyway && <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional), e.g. docs to follow from title" className="bg-white" />}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Every checklist item is finished.</p>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={close} disabled={busy || !date || (open.length > 0 && !anyway)} className="gap-1.5">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Close deal
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
