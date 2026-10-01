import React, { useEffect, useState } from 'react';
import SignedDownload from './SignedDownload';
import { useQueryClient } from '@tanstack/react-query';
import { base44, supabase } from '@/api/base44Client';
import { CheckCircle, Clock, Mail, XCircle, Loader2, RefreshCw, Eye, BellRing, HandHelping, ShieldCheck, Bell } from 'lucide-react';

// Status of one signing request, with who has signed and sender actions:
// nudge or resend a link, sign in person, change reminders, cancel the request, download
// or rebuild the signed PDF. Shows who has the document open right now.
export default function SigningRequestStatus({ sub, canManage }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const [viewing, setViewing] = useState([]);
  const open = sub.status === 'pending' || sub.status === 'in_progress';

  // "Viewing now": signers' pages announce themselves on this channel while open.
  useEffect(() => {
    if (!open) return undefined;
    const ch = supabase.channel(`esign:${sub.id}`);
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState();
      setViewing(Object.values(st).flat().map((p) => p.name).filter(Boolean));
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sub.id, open]);

  const inPerson = async (signer) => {
    setBusy(`inperson${signer.email}`);
    setNote(null);
    try {
      const res = await base44.functions.invoke('esignInPerson', { submissionId: sub.id, signerEmail: signer.email });
      window.open(res.data.url, '_blank', 'noopener');
      setNote(`Signing page opened for ${signer.name || signer.email}. Hand them the device.`);
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(null);
    }
  };

  const act = async (action, extra = {}) => {
    setBusy(action + (extra.signerEmail || ''));
    setNote(null);
    try {
      await base44.functions.invoke('esignManage', { action, submissionId: sub.id, ...extra });
      setNote({ resend: 'Link sent again.', void: 'Request cancelled.', nudge: 'Reminder sent.', settings: 'Reminders updated.' }[action] || 'Signed PDF rebuilt.');
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
          {sub.verify === 'email' && <span title="Signers confirm a code sent to their email" className="inline-flex items-center gap-0.5 text-[10px] text-blue-700"><ShieldCheck className="w-3 h-3" /> ID check</span>}
          {sub.sealed && <a href={`/verify?id=${encodeURIComponent(sub.id)}`} target="_blank" rel="noreferrer" title="Sealed: any change shows as invalid" className="inline-flex items-center gap-0.5 text-[10px] text-green-700 hover:underline"><ShieldCheck className="w-3 h-3" /> Sealed · verify</a>}
        </span>
        <span className="flex gap-1.5">
          {sub.signed_document_url && (
            <>
              <a href={sub.signed_document_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-green-300 text-green-700 px-2 py-1 hover:bg-green-50">
                <Eye className="w-3 h-3" /> Open
              </a>
              <SignedDownload url={sub.signed_document_url} label="PDF" className="border-green-300 text-green-700 hover:bg-green-50" />
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
      {total > 0 && sub.status !== 'voided' && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-green-500 transition-all" style={{ width: `${(signed / total) * 100}%` }} /></div>
      )}
      {viewing.length > 0 && (
        <p className="flex items-center gap-1.5 text-green-700"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> {viewing.join(', ')} {viewing.length === 1 ? 'is' : 'are'} viewing it now</p>
      )}
      <ul className="space-y-1">
        {(sub.signers || []).map((s) => {
          const turn = !s.signed && (!sequential || (s.order || 0) === nextOrder);
          return (
            <li key={s.email} className="flex items-center justify-between gap-2">
              <span className="truncate">
                {s.signed ? '✅' : s.viewed_at ? '👀' : '⏳'} {s.name || s.email}
                <span className="text-muted-foreground"> {s.signed ? `signed ${new Date(s.signed_at).toLocaleString()}${s.in_person_by ? ' in person' : ''}` : s.viewed_at ? `opened ${new Date(s.viewed_at).toLocaleString()}` : turn ? `emailed${s.notified_at ? ` ${new Date(s.notified_at).toLocaleDateString()}` : ''}` : 'not their turn yet'}</span>
              </span>
              {canManage && open && turn && (
                <span className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => act('nudge', { signerEmail: s.email })} disabled={!!busy} title="Send a friendly reminder" className="inline-flex items-center gap-1 text-amber-700 hover:underline">
                    {busy === 'nudge' + s.email ? <Loader2 className="w-3 h-3 animate-spin" /> : <BellRing className="w-3 h-3" />} Nudge
                  </button>
                  <button onClick={() => act('resend', { signerEmail: s.email })} disabled={!!busy} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                    {busy === 'resend' + s.email ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Resend
                  </button>
                  <button onClick={() => inPerson(s)} disabled={!!busy} title="Sign on this device, with them in front of you" className="inline-flex items-center gap-1 text-purple-700 hover:underline">
                    {busy === 'inperson' + s.email ? <Loader2 className="w-3 h-3 animate-spin" /> : <HandHelping className="w-3 h-3" />} In person
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {canManage && open && (
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <Bell className="w-3 h-3" /> Auto reminders
          <select className="rounded border border-border bg-background px-1 py-0.5 text-xs" value={sub.remind_days ?? 2}
            onChange={(e) => act('settings', { remindDays: Number(e.target.value) })} disabled={!!busy}>
            <option value={1}>every day</option><option value={2}>every 2 days</option><option value={3}>every 3 days</option><option value={7}>weekly</option><option value={0}>off</option>
          </select>
        </label>
      )}
      {note && <p className="text-muted-foreground">{note}</p>}
    </div>
  );
}
