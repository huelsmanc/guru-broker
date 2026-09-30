import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle, Clock, Mail, XCircle, Loader2, Download, RefreshCw, Eye } from 'lucide-react';

// Status of one signing request, with who has signed and sender actions:
// resend a link, cancel the request, download or rebuild the signed PDF.
export default function SigningRequestStatus({ sub, canManage }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  const act = async (action, extra = {}) => {
    setBusy(action + (extra.signerEmail || ''));
    setNote(null);
    try {
      await base44.functions.invoke('esignManage', { action, submissionId: sub.id, ...extra });
      setNote(action === 'resend' ? 'Link sent again.' : action === 'void' ? 'Request cancelled.' : 'Signed PDF rebuilt.');
      queryClient.invalidateQueries({ queryKey: ['esign-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['esign-documents'] });
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(null);
    }
  };

  const signed = (sub.signers || []).filter((s) => s.signed).length;
  const total = (sub.signers || []).length;
  const open = sub.status === 'pending' || sub.status === 'in_progress';
  const sequential = sub.sequence_type === 'sequential';
  const nextOrder = sequential
    ? Math.min(...(sub.signers || []).filter((s) => !s.signed).map((s) => s.order || 0))
    : null;

  return (
    <div className="w-full rounded-lg border border-border/50 bg-muted/30 p-3 text-xs space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-medium flex items-center gap-1.5">
          {sub.status === 'completed' ? <CheckCircle className="w-3.5 h-3.5 text-green-600" />
            : sub.status === 'voided' ? <XCircle className="w-3.5 h-3.5 text-red-500" />
            : <Clock className="w-3.5 h-3.5 text-blue-600" />}
          {sub.status === 'completed' ? 'Fully signed' : sub.status === 'voided' ? 'Cancelled' : `${signed} of ${total} signed`}
          {sequential && open && <span className="text-muted-foreground font-normal">· in order</span>}
        </span>
        <span className="flex gap-1.5">
          {sub.signed_document_url && (
            <>
              <a href={sub.signed_document_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-green-300 text-green-700 px-2 py-1 hover:bg-green-50">
                <Eye className="w-3 h-3" /> Open
              </a>
              <a href={`${sub.signed_document_url}&download=1`} className="inline-flex items-center gap-1 rounded-md border border-green-300 text-green-700 px-2 py-1 hover:bg-green-50">
                <Download className="w-3 h-3" /> PDF
              </a>
            </>
          )}
          {canManage && sub.status === 'completed' && (sub.finalize_error || !sub.signed_pdf_path) && (
            <button onClick={() => act('rebuild')} disabled={!!busy} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted">
              {busy === 'rebuild' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Make signed PDF
            </button>
          )}
          {canManage && open && (
            <button onClick={() => window.confirm('Cancel this signing request? The links will stop working.') && act('void')}
              disabled={!!busy} className="inline-flex items-center gap-1 rounded-md border border-red-200 text-red-600 px-2 py-1 hover:bg-red-50">
              {busy === 'void' ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />} Cancel
            </button>
          )}
        </span>
      </div>
      <ul className="space-y-1">
        {(sub.signers || []).map((s) => {
          const turn = !s.signed && (!sequential || (s.order || 0) === nextOrder);
          return (
            <li key={s.email} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {s.signed ? '✅' : s.viewed_at ? '👀' : '⏳'} {s.name || s.email}
                <span className="text-muted-foreground"> {s.signed ? `signed ${new Date(s.signed_at).toLocaleString()}` : s.viewed_at ? 'opened' : turn ? 'waiting to sign' : 'not their turn yet'}</span>
              </span>
              {canManage && open && turn && (
                <button onClick={() => act('resend', { signerEmail: s.email })} disabled={!!busy}
                  className="inline-flex items-center gap-1 text-blue-700 hover:underline flex-shrink-0">
                  {busy === 'resend' + s.email ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Resend
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {note && <p className="text-muted-foreground">{note}</p>}
    </div>
  );
}
