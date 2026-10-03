// The AI check on a checklist document: what it found, for the agent and the approver.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, RefreshCw, FileQuestion } from 'lucide-react';

/** The saved check, if it's for the document on the item now. */
export const currentReview = (item) => (item?.ai_review && item.ai_review.document_url === item.document_url ? item.ai_review : null);

/** Start (or restart) the check. Quietly; the item updates when it's done. */
export const runAiCheck = (checklistId, itemId, opts = {}) =>
  base44.functions.invoke('docReview', { checklist_id: checklistId, item_id: itemId, ...opts });

/** A note to the agent written from the findings, for "Send back". */
export function reviewNote(r) {
  if (!r) return '';
  const lines = [];
  if (r.matches_item === false) lines.push(r.matches_note || 'This looks like the wrong document.');
  for (const i of r.issues || []) if (i.severity !== 'low') lines.push(`${i.description}${i.page && !/page/i.test(i.description) ? ` (page ${i.page})` : ''}`);
  for (const m of r.mismatches || []) lines.push(`${m.field}: document says ${m.document_value}, our records say ${m.deal_value}`);
  return lines.join('; ');
}

export default function AiReview({ item, checklistId, canRun, onUseNote, autoRun = false, refresh }) {
  const r = currentReview(item);
  const [busy, setBusy] = useState(false);
  const checking = busy || r?.status === 'checking';
  const run = async (force) => {
    setBusy(true);
    try { await runAiCheck(checklistId, item.id, { force }); } catch (err) { window.alert(err.message); } finally { setBusy(false); refresh?.(); }
  };
  // Approvers opening an item nobody checked yet: check it now.
  useEffect(() => { if (autoRun && canRun && item.document_url && !r) run(false); }, [item.id, item.document_url]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item.document_url) return null;
  if (checking) {
    return <Box tone="slate"><Loader2 className="w-4 h-4 animate-spin text-violet-600" /><p className="text-sm">AI is checking this document…</p></Box>;
  }
  if (!r) {
    return canRun ? (
      <button onClick={() => run(false)} className="w-full flex items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-sm text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30">
        <Sparkles className="w-4 h-4" /> Check this document with AI
      </button>
    ) : null;
  }
  const again = canRun && <button onClick={() => run(true)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Check again</button>;
  if (r.status === 'error') return <Box tone="slate"><AlertTriangle className="w-4 h-4 text-amber-600" /><p className="text-sm flex-1">{r.error}</p>{again}</Box>;
  if (r.verdict === 'unreadable') return <Box tone="slate"><FileQuestion className="w-4 h-4 text-muted-foreground" /><p className="text-sm flex-1 text-muted-foreground">{r.summary}</p></Box>;

  const ok = r.verdict === 'looks_complete';
  const findings = [
    ...(r.matches_item === false ? [{ severity: 'high', description: r.matches_note || 'This may not be the right document.' }] : []),
    ...(r.issues || []).map((i) => ({ ...i, description: `${i.description}${i.page && !/page/i.test(i.description) ? ` (page ${i.page})` : ''}` })),
    ...(r.mismatches || []).map((m) => ({ severity: 'high', description: `${m.field}: document says ${m.document_value}, our records say ${m.deal_value}` })),
  ];
  return (
    <div className={`rounded-xl border p-3 ${ok ? 'border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/20 dark:border-emerald-900' : 'border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-900'}`}>
      <div className="flex items-start gap-2">
        {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" /> {ok ? 'AI check: looks complete' : `AI check: ${findings.length} thing${findings.length === 1 ? '' : 's'} to look at`}
          </p>
          {r.summary && <p className="text-xs text-muted-foreground mt-0.5">{r.document_type ? `${r.document_type}. ` : ''}{r.summary}</p>}
        </div>
      </div>
      {findings.length > 0 && (
        <ul className="mt-2 space-y-1 pl-6">
          {findings.map((f, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${f.severity === 'high' ? 'bg-red-500' : f.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'}`} />
              <span>{f.description}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 mt-2 pl-6">
        {!ok && onUseNote && <button onClick={() => onUseNote(reviewNote(r))} className="text-xs font-medium text-primary hover:underline">Use as note to the agent</button>}
        {again}
        <span className="text-[11px] text-muted-foreground ml-auto">AI can miss things. Give it a look too.</span>
      </div>
    </div>
  );
}

function Box({ tone, children }) {
  return <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${tone === 'slate' ? 'bg-muted/40' : ''}`}>{children}</div>;
}
