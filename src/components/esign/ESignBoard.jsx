import React, { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileText, Send, PenTool, CheckCircle, AlertTriangle } from 'lucide-react';
import SigningRequestStatus from './SigningRequestStatus';
import LinkDealPicker from './LinkDealPicker';

const DAY = 864e5;
const OVERDUE_DAYS = 5;

const COLUMNS = [
  { id: 'draft', label: 'Draft', icon: FileText, tone: 'border-slate-300', dot: 'bg-slate-400' },
  { id: 'out', label: 'Out for signature', icon: Send, tone: 'border-blue-300', dot: 'bg-blue-500' },
  { id: 'partly', label: 'Partly signed', icon: PenTool, tone: 'border-purple-300', dot: 'bg-purple-500' },
  { id: 'overdue', label: 'Overdue', icon: AlertTriangle, tone: 'border-amber-400', dot: 'bg-amber-500' },
  { id: 'completed', label: 'Completed', icon: CheckCircle, tone: 'border-green-300', dot: 'bg-green-500' },
];

const ago = (iso) => {
  if (!iso) return '';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};

/** Where each document is in signing: the newest request for it decides. */
export function boardColumn(doc, sub) {
  if (!sub || sub.status === 'voided') return 'draft';
  if (sub.status === 'completed') return 'completed';
  const signers = sub.signers || [];
  const last = Math.max(...signers.map((s) => new Date(s.signed_at || s.viewed_at || s.notified_at || 0).getTime()), new Date(sub.submitted_at || sub.created_date).getTime());
  if (Date.now() - last > OVERDUE_DAYS * DAY || (sub.expires_at && new Date(sub.expires_at).getTime() - Date.now() < 3 * DAY)) return 'overdue';
  return signers.some((s) => s.signed) ? 'partly' : 'out';
}

export default function ESignBoard({ documents, submissions, canManage, onOpenDraft, brokerageId }) {
  const [openSub, setOpenSub] = useState(null);
  const cards = useMemo(() => documents.map((doc) => {
    const sub = submissions.filter((s) => s.document_id === doc.id).sort((a, b) => String(b.created_date).localeCompare(String(a.created_date)))[0] || null;
    return { doc, sub, col: boardColumn(doc, sub) };
  }), [documents, submissions]);

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 snap-x">
        {COLUMNS.map((c) => {
          const list = cards.filter((k) => k.col === c.id);
          const Icon = c.icon;
          return (
            <div key={c.id} className="min-w-[230px] w-[230px] flex-shrink-0 snap-start">
              <div className="flex items-center gap-2 mb-2 px-1">
                <Icon className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold">{c.label}</p>
                <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2">{list.length}</span>
              </div>
              <div className="space-y-2 rounded-xl bg-muted/40 p-2 min-h-[120px]">
                {list.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Nothing here</p>}
                {list.map(({ doc, sub }) => {
                  const signers = sub?.signers || doc.signers || [];
                  const signed = signers.filter((s) => s.signed).length;
                  const next = signers.find((s) => !s.signed);
                  return (
                    <button key={doc.id} type="button" onClick={() => (sub ? setOpenSub({ sub, doc }) : onOpenDraft?.(doc))}
                      className={`w-full text-left bg-card rounded-lg border-l-4 ${c.tone} border border-border/60 p-3 hover:shadow-md transition-shadow`}>
                      <p className="text-sm font-medium line-clamp-2">{doc.title}</p>
                      {sub && signers.length > 0 && (
                        <>
                          <div className="flex gap-0.5 mt-2">
                            {signers.map((s, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${s.signed ? 'bg-green-500' : s.viewed_at ? 'bg-blue-300' : 'bg-muted-foreground/20'}`} />)}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1.5">
                            {c.id === 'completed' ? `Completed ${ago(sub.completed_at)}` : `${signed}/${signers.length} signed${next ? ` · waiting on ${next.name || next.email}` : ''}`}
                          </p>
                          {c.id !== 'completed' && <p className="text-[11px] text-muted-foreground">Sent {ago(sub.submitted_at || sub.created_date)}</p>}
                        </>
                      )}
                      {!sub && <p className="text-[11px] text-muted-foreground mt-1">{(doc.fields || []).length} boxes · not sent</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <Dialog open={!!openSub} onOpenChange={(o) => !o && setOpenSub(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="pr-6">{openSub?.doc.title}</DialogTitle></DialogHeader>
          {openSub && canManage(openSub.doc) && <LinkDealPicker doc={documents.find((d) => d.id === openSub.doc.id) || openSub.doc} brokerageId={brokerageId} />}
          {openSub && <SigningRequestStatus sub={submissions.find((s) => s.id === openSub.sub.id) || openSub.sub} canManage={canManage(openSub.doc)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
