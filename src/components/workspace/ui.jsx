import React from 'react';

export function Section({ title, subtitle, actions, children }) {
  return (
    <section className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export const money = (n) => (n == null || n === '' || Number.isNaN(Number(n)) ? '-' : `${Number(n) < 0 ? '-' : ''}$${Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export function Row({ label, value, strong }) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex-1 border-b border-dotted border-border/80 translate-y-[-3px]" />
      <span className={strong ? 'font-semibold' : ''}>{value}</span>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export const STATUS_PILL = {
  open: 'bg-slate-100 text-slate-600', uploaded: 'bg-slate-200 text-slate-700', review_requested: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700', rejected: 'bg-red-100 text-red-700', exempt: 'bg-violet-100 text-violet-700', done: 'bg-green-100 text-green-700',
  pending_approval: 'bg-amber-100 text-amber-800', sending: 'bg-blue-100 text-blue-700', sent: 'bg-blue-100 text-blue-700', paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700', void: 'bg-slate-100 text-slate-400 line-through',
};
export function Pill({ status, children }) {
  return <span className={`text-[11px] font-medium rounded px-2 py-0.5 whitespace-nowrap ${STATUS_PILL[status] || 'bg-slate-100 text-slate-600'}`}>{children || String(status || '').replace(/_/g, ' ')}</span>;
}
