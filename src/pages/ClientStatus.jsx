import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, Circle, Home, Mail, Phone } from 'lucide-react';

// Public, read-only progress page a client opens from their agent's link: /status?token=...
export default function ClientStatus() {
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch('/api/fn/sharedStatus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: params.get('token') }) })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); })
      .catch((e) => setError(e.message));
  }, [params]);
  if (error) return <div className="min-h-screen flex items-center justify-center p-6 text-center text-slate-600">{error}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  const pct = data.progress?.total ? Math.round((data.progress.done / data.progress.total) * 100) : null;
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><Home className="w-5 h-5" /></div>
          <div><h1 className="text-xl font-bold">{data.property}</h1><p className="text-sm text-slate-500 capitalize">{String(data.status || '').replace(/_/g, ' ')}</p></div></div>
        {pct != null && (
          <div className="bg-white rounded-2xl border p-5">
            <div className="flex justify-between text-sm mb-2"><span className="font-medium">Progress</span><span>{pct}%</span></div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
            {data.progress.steps?.length > 0 && <ul className="mt-4 space-y-2">{data.progress.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">{s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-slate-300" />}{s.title}</li>))}</ul>}
          </div>
        )}
        {data.dates?.length > 0 && (
          <div className="bg-white rounded-2xl border p-5">
            <p className="font-medium mb-3">Key dates</p>
            <ul className="space-y-2">{data.dates.map((d) => (
              <li key={d.label} className="flex justify-between text-sm"><span className="flex items-center gap-2">{d.done ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-slate-300" />}{d.label}</span>
                <span>{new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span></li>))}</ul>
          </div>
        )}
        {data.agent && (
          <div className="bg-white rounded-2xl border p-5 flex items-center gap-4">
            {data.agent.photo && <img src={data.agent.photo} alt="" className="w-14 h-14 rounded-full object-cover" />}
            <div className="text-sm"><p className="font-medium">{data.agent.name}</p>
              <a href={`mailto:${data.agent.email}`} className="flex items-center gap-1 text-emerald-700"><Mail className="w-3 h-3" />{data.agent.email}</a>
              {data.agent.phone && <a href={`tel:${data.agent.phone}`} className="flex items-center gap-1"><Phone className="w-3 h-3" />{data.agent.phone}</a>}</div>
          </div>
        )}
      </div>
    </div>
  );
}
