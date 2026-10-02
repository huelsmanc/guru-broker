import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Home, MessageSquare, FileText, CalendarDays, Send, Upload, CheckCircle2, Circle, Mail, Phone, ShieldCheck, Paperclip, Clock } from 'lucide-react';
import { supabase } from '@/api/base44Client';
import { cn } from '@/lib/utils';

// The client's own page for their deal: /portal?t=... (no account; confirmed by an emailed code).
const api = async (action, body = {}) => {
  const r = await fetch('/api/fn/clientPortal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Something went wrong. Try again.'), { status: r.status });
  return d;
};
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* private mode */ } },
};
const day = (d) => new Date(`${String(d).slice(0, 10)}T12:00:00`);
const fmtDay = (d) => day(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (d) => { const x = new Date(d); const today = x.toDateString() === new Date().toDateString(); return today ? x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
const daysUntil = (d) => Math.round((day(d) - new Date(new Date().toDateString())) / 864e5);
const STATUS = { active: 'Under contract', clear_to_close: 'Clear to close', closed: 'Closed', cancelled: 'Cancelled', pending: 'Pending' };

export default function PortalPage() {
  const [params] = useSearchParams();
  const t = params.get('t') || '';
  const key = `gbh_portal:${t.slice(0, 16)}`;
  const [phase, setPhase] = useState('loading'); // loading | code | ready | error
  const [hint, setHint] = useState('');
  const [firstName, setFirstName] = useState('');
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const signOut = useCallback(() => { store.set(key, null); window.location.reload(); }, [key]);

  useEffect(() => {
    if (!t) { setError('This link is missing something. Open it again from your email.'); setPhase('error'); return; }
    api('open', { t, session: store.get(key) || undefined })
      .then((r) => { if (r.session) { setSession(r.session); setPhase('ready'); } else { setHint(r.email_hint); setFirstName(r.name || ''); setPhase('code'); } })
      .catch((e) => { setError(e.message); setPhase('error'); });
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'loading') return <Center><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></Center>;
  if (phase === 'error') return <Center><div className="max-w-sm text-center"><Home className="w-10 h-10 mx-auto text-slate-300" /><p className="mt-3 text-slate-700">{error}</p></div></Center>;
  if (phase === 'code') return <CodeStep t={t} hint={hint} firstName={firstName} onDone={(s) => { store.set(key, s); setSession(s); setPhase('ready'); }} />;
  return <Portal session={session} onSignedOut={signOut} />;
}

function Center({ children }) {
  return <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 p-6">{children}</div>;
}

function CodeStep({ t, hint, firstName, onDone }) {
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async () => { setBusy(true); setError(''); try { await api('send_code', { t }); setSent(true); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const verify = async (e) => { e?.preventDefault(); setBusy(true); setError(''); try { const r = await api('verify', { t, code }); onDone(r.session); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  useEffect(() => { if (code.length === 6 && !busy) verify(); }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Center>
      <div className="w-full max-w-sm rounded-3xl bg-white border shadow-sm p-7 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto"><ShieldCheck className="w-6 h-6" /></div>
        <h1 className="mt-4 text-xl font-bold text-slate-900">{firstName ? `Welcome, ${firstName}` : 'Welcome'}</h1>
        <p className="mt-1 text-sm text-slate-500">This is your private page for your home purchase or sale. First, let's confirm it's you.</p>
        {!sent ? (
          <>
            <p className="mt-5 text-sm text-slate-700">We'll email a 6-digit code to <b>{hint}</b>.</p>
            <button onClick={send} disabled={busy} className="mt-4 w-full h-12 rounded-xl bg-slate-900 text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Email me a code</button>
          </>
        ) : (
          <form onSubmit={verify} className="mt-5">
            <p className="text-sm text-slate-700">Enter the code we sent to <b>{hint}</b>.</p>
            <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-3 w-full h-14 rounded-xl border text-center text-2xl tracking-[0.5em] font-semibold outline-none focus:ring-2 focus:ring-emerald-500" placeholder="••••••" />
            <button type="submit" disabled={busy || code.length !== 6} className="mt-3 w-full h-12 rounded-xl bg-slate-900 text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Continue</button>
            <button type="button" onClick={send} disabled={busy} className="mt-3 text-sm text-slate-500 underline">Send a new code</button>
          </form>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </Center>
  );
}

function Portal({ session, onSignedOut }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('messages');
  const [error, setError] = useState('');
  const load = useCallback(() => api('load', { session }).then(setData).catch((e) => { if (e.status === 401) onSignedOut(); else setError(e.message); }), [session, onSignedOut]);
  useEffect(() => { load(); }, [load]);
  // Keep the messages fresh while the page is open.
  useEffect(() => {
    if (!data) return undefined;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      const last = data.messages[data.messages.length - 1]?.at;
      try {
        const { messages } = await api('messages', { session, after: last });
        if (messages.length) setData((d) => ({ ...d, messages: [...d.messages, ...messages.filter((m) => !d.messages.some((x) => x.id === m.id))] }));
      } catch (e) { if (e.status === 401) onSignedOut(); }
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [data, session, onSignedOut]);

  if (error) return <Center><p className="text-slate-700">{error}</p></Center>;
  if (!data) return <Center><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></Center>;
  const accent = data.brand.color || '#059669';
  const closing = data.deal.dates.find((d) => d.label === 'Closing');
  const left = closing ? daysUntil(closing.date) : null;
  const waiting = data.requests.filter((r) => r.status === 'open').length;
  const pct = data.deal.progress?.total ? Math.round((data.deal.progress.done / data.deal.progress.total) * 100) : null;
  const tabs = [['messages', 'Messages', MessageSquare], ['documents', 'Documents', FileText, waiting], ['details', 'Timeline', CalendarDays]];

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-50 text-slate-900">
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            {data.brand.logo ? <img src={data.brand.logo} alt={data.brand.name} className="h-8 max-w-[140px] object-contain" /> : <span className="text-sm font-semibold text-slate-500">{data.brand.name}</span>}
            <span className="ml-auto text-xs text-slate-400">Hi, {String(data.me.name || '').split(' ')[0]}</span>
          </div>
          <div className="mt-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold leading-tight">{data.deal.property}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full px-2 py-0.5 font-medium text-white" style={{ background: accent }}>{STATUS[data.deal.status] || 'In progress'}</span>
                {pct != null && <span className="text-slate-500">{pct}% of steps done</span>}
              </div>
            </div>
            {left != null && left >= 0 && data.deal.status !== 'closed' && (
              <div className="text-center rounded-2xl px-3 py-1.5 text-white flex-shrink-0" style={{ background: accent }}>
                <p className="text-2xl font-bold leading-none">{left}</p>
                <p className="text-[10px] opacity-90 mt-0.5">{left === 1 ? 'day to close' : 'days to close'}</p>
              </div>
            )}
          </div>
          {pct != null && <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} /></div>}
        </div>
        <nav className="max-w-3xl mx-auto px-2 flex">
          {tabs.map(([k, label, Icon, badge]) => (
            <button key={k} onClick={() => setTab(k)} className={cn('flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm border-b-2 transition-colors', tab === k ? 'font-semibold text-slate-900' : 'border-transparent text-slate-500')}
              style={tab === k ? { borderColor: accent } : undefined}>
              <Icon className="w-4 h-4" />{label}{badge ? <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">{badge}</span> : null}
            </button>
          ))}
        </nav>
      </header>
      <main className="flex-1 min-h-0">
        {tab === 'messages' && <Messages data={data} setData={setData} session={session} accent={accent} />}
        {tab === 'documents' && <Documents data={data} session={session} reload={load} accent={accent} />}
        {tab === 'details' && <Details data={data} accent={accent} />}
      </main>
    </div>
  );
}

function Avatar({ name, photo, size = 32 }) {
  return photo ? <img src={photo} alt="" className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
    : <span className="rounded-full bg-slate-200 text-slate-600 font-semibold flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, fontSize: size * 0.4 }}>{String(name || '?')[0].toUpperCase()}</span>;
}

function Messages({ data, setData, session, accent }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useLayoutEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [data.messages.length]);
  const send = async (e) => {
    e?.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    setBusy(true); setText('');
    try { const { message } = await api('send', { session, text: v }); setData((d) => ({ ...d, messages: d.messages.some((m) => m.id === message.id) ? d.messages : [...d.messages, message] })); }
    catch (err) { setText(v); window.alert(err.message); } finally { setBusy(false); }
  };
  const body = (c) => (String(c).startsWith('[file]') || String(c).startsWith('[voice_memo]') ? <span className="italic opacity-80">📎 Attachment (ask your agent to send it by email)</span> : String(c).startsWith('[call]') ? <span className="italic opacity-80">📞 Call</span> : c);
  return (
    <div className="h-full max-w-3xl mx-auto flex flex-col">
      <div ref={box} className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
        {!data.messages.length && (
          <div className="text-center py-10 px-6">
            <div className="flex justify-center -space-x-2">{data.team.slice(0, 3).map((p) => <span key={p.name} className="ring-2 ring-slate-50 rounded-full"><Avatar name={p.name} photo={p.photo} size={44} /></span>)}</div>
            <p className="mt-3 font-medium">Message your team</p>
            <p className="text-sm text-slate-500 mt-1">Questions about your deal? Ask here. {data.team.map((p) => p.name.split(' ')[0]).join(' and ')} will see it right away.</p>
          </div>
        )}
        {data.messages.map((m, i) => {
          const prev = data.messages[i - 1];
          const grouped = prev && prev.mine === m.mine && prev.name === m.name && new Date(m.at) - new Date(prev.at) < 5 * 60_000;
          return (
            <div key={m.id} className={cn('flex gap-2', m.mine ? 'justify-end' : 'justify-start', !grouped && 'pt-2')}>
              {!m.mine && <div className="w-8 flex-shrink-0">{!grouped && <Avatar name={m.name} photo={m.photo} />}</div>}
              <div className={cn('max-w-[80%] min-w-0 flex flex-col', m.mine && 'items-end')}>
                {!m.mine && !grouped && <span className="text-[11px] text-slate-500 ml-1 mb-0.5">{m.name}</span>}
                <div className={cn('rounded-2xl px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap break-words', m.mine ? 'text-white rounded-br-md' : 'bg-white border rounded-bl-md')} style={m.mine ? { background: accent } : undefined}>{body(m.content)}</div>
                {(!data.messages[i + 1] || data.messages[i + 1].mine !== m.mine || new Date(data.messages[i + 1].at) - new Date(m.at) > 5 * 60_000) && <span className="text-[10px] text-slate-400 mt-0.5 px-1">{fmtTime(m.at)}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={send} className="border-t bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2 rounded-3xl border bg-slate-50 px-3 py-1.5 focus-within:bg-white">
          <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(min-width: 640px)').matches) { e.preventDefault(); send(); } }}
            placeholder="Message your team…" className="flex-1 min-w-0 resize-none bg-transparent py-1.5 text-base sm:text-sm outline-none max-h-32" />
          <button type="submit" disabled={!text.trim() || busy} onPointerDown={(e) => e.preventDefault()} className="p-2 rounded-full text-white disabled:opacity-40" style={{ background: accent }} aria-label="Send"><Send className="w-4 h-4" /></button>
        </div>
      </form>
    </div>
  );
}

function Documents({ data, session, reload, accent }) {
  const [busy, setBusy] = useState(null);
  const [done, setDone] = useState('');
  const pick = useRef(null);
  const target = useRef(null);
  const upload = async (file) => {
    if (!file) return;
    const reqId = target.current;
    setBusy(reqId || 'general'); setDone('');
    try {
      const { path, token } = await api('upload_url', { session, name: file.name, size: file.size, type: file.type });
      const { error } = await supabase.storage.from('private-files').uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });
      if (error) throw new Error(error.message);
      await api('upload_done', { session, path, name: file.name, request_id: reqId || undefined });
      setDone(file.name);
      await reload();
    } catch (err) { window.alert(err.message); } finally { setBusy(null); if (pick.current) pick.current.value = ''; }
  };
  const choose = (reqId) => { target.current = reqId; pick.current?.click(); };
  const open = data.requests.filter((r) => r.status === 'open');
  const received = data.requests.filter((r) => r.status === 'received');
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <input ref={pick} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.heic,.heif,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => upload(e.target.files?.[0])} />
        {done && <p className="rounded-xl bg-emerald-50 text-emerald-800 text-sm px-4 py-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Sent “{done}” to your team. Thank you!</p>}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Needed from you</h2>
          {!open.length ? <p className="rounded-2xl border bg-white px-4 py-6 text-center text-sm text-slate-500">Nothing needed right now. 🎉</p> : (
            <ul className="space-y-2">
              {open.map((r) => (
                <li key={r.id} className="rounded-2xl border bg-white p-4 flex items-start gap-3">
                  <span className="mt-0.5 w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0"><Clock className="w-4 h-4" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{r.title}</p>
                    {r.note && <p className="text-sm text-slate-500 mt-0.5">{r.note}</p>}
                    <p className="text-xs text-slate-400 mt-1">Requested by {r.by}</p>
                  </div>
                  <button onClick={() => choose(r.id)} disabled={!!busy} className="flex-shrink-0 rounded-xl px-3.5 py-2 text-sm font-medium text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: accent }}>
                    {busy === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <button onClick={() => choose(null)} disabled={!!busy} className="w-full rounded-2xl border-2 border-dashed border-slate-300 bg-white py-4 text-sm text-slate-600 flex items-center justify-center gap-2 hover:bg-slate-50 disabled:opacity-60">
          {busy === 'general' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />} Send another document to your team
        </button>
        {(received.length > 0 || data.uploads.length > 0) && (
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Sent</h2>
            <ul className="rounded-2xl border bg-white divide-y">
              {data.uploads.map((u, i) => (
                <li key={i} className="px-4 py-3 flex items-center gap-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{u.name}</span>
                  <span className="text-xs text-slate-400 flex-shrink-0">{u.at ? new Date(u.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="text-xs text-slate-400 text-center">Files go only to your agent's team. PDF, photos, Word or Excel, up to 25 MB.</p>
      </div>
    </div>
  );
}

function Details({ data, accent }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {data.deal.dates.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Key dates</h2>
            <ol className="rounded-2xl border bg-white p-4 space-y-3">
              {data.deal.dates.map((d) => {
                const n = daysUntil(d.date);
                return (
                  <li key={d.label} className="flex items-center gap-3">
                    {d.done ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: accent }} /> : <Circle className="w-5 h-5 text-slate-300 flex-shrink-0" />}
                    <span className={cn('flex-1 text-sm', d.done && 'text-slate-400 line-through')}>{d.label}</span>
                    <span className="text-sm text-right">{fmtDay(d.date)}{!d.done && n >= 0 && <span className="block text-[11px] text-slate-400">{n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</span>}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Your team</h2>
          <ul className="space-y-2">
            {data.team.map((p) => (
              <li key={p.name} className="rounded-2xl border bg-white p-4 flex items-center gap-3">
                <Avatar name={p.name} photo={p.photo} size={48} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.role}</p>
                </div>
                <div className="flex gap-2">
                  {p.phone && <a href={`tel:${p.phone}`} className="w-10 h-10 rounded-full border flex items-center justify-center text-slate-600 hover:bg-slate-50" aria-label={`Call ${p.name}`}><Phone className="w-4 h-4" /></a>}
                  {p.email && <a href={`mailto:${p.email}`} className="w-10 h-10 rounded-full border flex items-center justify-center text-slate-600 hover:bg-slate-50" aria-label={`Email ${p.name}`}><Mail className="w-4 h-4" /></a>}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <p className="text-xs text-slate-400 text-center">{data.brand.name} · Equal Housing Opportunity</p>
      </div>
    </div>
  );
}
