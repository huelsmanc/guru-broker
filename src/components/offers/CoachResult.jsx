import React from 'react';
import { Button } from '@/components/ui/button';

/** The AI pricing coach's answer: suggested price, why, how to make the offer stronger, risks, comps used. */
export default function CoachResult({ data, onUsePrice }) {
  const s = data.strategy || {};
  const m = (v) => (v == null ? '-' : `$${Number(v).toLocaleString('en-US')}`);
  return (
    <div className="text-sm space-y-2">
      <p className="font-medium">{s.headline}</p>
      {s.suggested_price != null && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-background border px-3 py-1.5"><span className="text-xs text-muted-foreground">Suggested</span> <strong>{m(s.suggested_price)}</strong></span>
          {s.price_low != null && <span className="text-xs text-muted-foreground">range {m(s.price_low)} to {m(s.price_high)}</span>}
          <span className={`text-[11px] rounded-full px-2 py-0.5 ${s.confidence === 'high' ? 'bg-green-100 text-green-800' : s.confidence === 'low' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{s.confidence} confidence</span>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onUsePrice(s.suggested_price)}>Use this price</Button>
        </div>
      )}
      {s.market_read && <p className="text-xs text-muted-foreground">{s.market_read}</p>}
      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        {[['Why', s.reasons], ['Make it stronger', s.term_tips], ['Watch out for', s.risks]].map(([h, list]) => (
          <div key={h}><p className="font-semibold mb-1">{h}</p><ul className="list-disc pl-4 space-y-0.5">{(list || []).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        ))}
      </div>
      {data.comps?.length > 0 && (
        <details className="text-xs"><summary className="cursor-pointer text-muted-foreground">{data.comps.length} recent sales used</summary>
          <ul className="mt-1 space-y-0.5">{data.comps.map((c) => <li key={c.id}>{c.address}: sold {m(c.soldPrice)}{c.listPrice ? ` (list ${m(c.listPrice)})` : ''}{c.soldDate ? `, ${c.soldDate}` : ''}{c.beds ? ` · ${c.beds}bd` : ''}{c.sqft ? ` · ${c.sqft} sqft` : ''}</li>)}</ul>
        </details>
      )}
      <p className="text-[11px] text-muted-foreground">AI suggestion from synced MLS data. Use your judgment; it isn't an appraisal.</p>
    </div>
  );
}

