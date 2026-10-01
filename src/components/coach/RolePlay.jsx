import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Mic, MicOff, PhoneOff, Phone, Loader2, RotateCcw, CheckCircle2, XCircle, ChevronDown, ChevronUp, Sparkles, Clock, Target, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { isAdminRole, can } from '../../../shared/permissions.generated.js';

const CATS = [['rapport', 'Rapport'], ['discovery', 'Discovery'], ['objection_handling', 'Objections'], ['value', 'Value'], ['closing', 'Closing']];
const OUTCOME = { goal_reached: ['Goal reached', 'bg-emerald-100 text-emerald-800'], partial: ['Partly there', 'bg-amber-100 text-amber-800'], missed: ['Goal missed', 'bg-red-100 text-red-700'] };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const scoreColor = (n) => (n >= 80 ? 'text-emerald-600' : n >= 60 ? 'text-amber-600' : 'text-red-600');

/** Voice role-play: pick a character, talk out loud, get graded. */
export default function RolePlay({ user }) {
  const queryClient = useQueryClient();
  const admin = isAdminRole(user?.role) || user?.role === 'super_admin' || can(user, 'reports.company');
  const { data: meta } = useQuery({ queryKey: ['roleplay-scenarios'], queryFn: async () => (await base44.functions.invoke('salesRoleplay', { action: 'scenarios' })).data, staleTime: 3600_000 });
  const [scope, setScope] = useState('mine');
  const { data: history = [] } = useQuery({
    queryKey: ['roleplay-history', user?.email, scope],
    queryFn: () => base44.entities.RoleplaySession.filter(scope === 'team' ? { brokerage_id: user.brokerage_id } : { agent_email: String(user.email).toLowerCase() }, '-created_date', 50).catch(() => []),
    enabled: !!user?.email,
  });
  const [scenario, setScenario] = useState(null);
  const [difficulty, setDifficulty] = useState('realistic');
  const [phase, setPhase] = useState('pick'); // pick | live | grading | result
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const current = meta?.scenarios?.find((s) => s.key === scenario);

  const done = (session) => {
    setResult(session); setPhase('result');
    queryClient.invalidateQueries({ queryKey: ['roleplay-history'] });
  };

  if (phase === 'live' || phase === 'grading') {
    return <LiveCall user={user} scenario={current} difficulty={difficulty} grading={phase === 'grading'} maxMinutes={meta?.max_minutes || 5}
      onGrading={() => setPhase('grading')} onDone={done} onFail={(msg) => { setError(msg); setPhase('pick'); }} />;
  }
  if (phase === 'result' && result) {
    return <Scorecard session={result} scenario={meta?.scenarios?.find((s) => s.key === result.scenario)}
      onAgain={() => { setScenario(result.scenario); setDifficulty(result.difficulty || 'realistic'); setResult(null); setPhase('live'); }}
      onBack={() => { setResult(null); setPhase('pick'); }} />;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 sm:p-6">
          <p className="text-xs uppercase tracking-wider text-emerald-300">Voice role-play</p>
          <h2 className="text-xl sm:text-2xl font-bold mt-1">Practice the conversation out loud</h2>
          <p className="text-sm text-slate-300 mt-1 max-w-2xl">Pick a character and talk to them like a real call. They have their own personality, real objections and a hidden reason they might say yes. Find it, handle the pushback, ask for the next step. You get a scorecard when you hang up.</p>
        </div>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm p-3">{error}</p>}

        <div>
          <p className="font-semibold mb-3">1. Pick who you're talking to</p>
          {!meta ? <Loader2 className="w-5 h-5 animate-spin" /> : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {meta.scenarios.map((s) => (
                <button key={s.key} type="button" onClick={() => setScenario(s.key)}
                  className={`text-left rounded-2xl border p-4 transition ${scenario === s.key ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'bg-card hover:border-primary/50'}`}>
                  <div className="flex items-center gap-2"><span className="text-2xl">{s.emoji}</span><span className="font-semibold">{s.title}</span></div>
                  <p className="text-xs text-muted-foreground mt-1">with {s.persona}</p>
                  <p className="text-sm mt-2 line-clamp-3">{s.setup}</p>
                  <p className="text-xs mt-2 text-primary font-medium flex items-center gap-1"><Target className="w-3.5 h-3.5" /> {s.goal}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="font-semibold mb-3">2. How hard?</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {Object.entries(meta?.difficulties || {}).map(([k, d]) => (
              <button key={k} type="button" onClick={() => setDifficulty(k)}
                className={`text-left rounded-xl border p-3 ${difficulty === k ? 'border-primary ring-2 ring-primary/30 bg-primary/5' : 'bg-card hover:border-primary/50'}`}>
                <p className="font-medium text-sm">{d.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{d.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="gap-2 rounded-xl h-12 px-6" disabled={!scenario} onClick={() => { setError(''); setPhase('live'); }}>
            <Phone className="w-5 h-5" /> {current ? `Call ${current.persona.split(' ')[0]}` : 'Start the call'}
          </Button>
          <p className="text-xs text-muted-foreground">Allow the microphone when asked. Headphones work best. Calls end on their own after {meta?.max_minutes || 5} minutes.</p>
        </div>

        <div className="rounded-2xl border bg-card">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <p className="font-semibold">Practice history</p>
            {admin && (
              <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
                {[['mine', 'Mine'], ['team', 'Team']].map(([k, l]) => <button key={k} type="button" onClick={() => setScope(k)} className={`px-2.5 py-1 rounded-md ${scope === k ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>{k === 'team' && <Users className="w-3 h-3 inline mr-1" />}{l}</button>)}
              </div>
            )}
          </div>
          {history.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No practice calls yet.</p> : (
            <ul className="divide-y">
              {history.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => { if (h.status === 'scored') { setResult(h); setPhase('result'); } }} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40">
                    <span className={`w-11 text-center font-bold ${h.score != null ? scoreColor(h.score) : 'text-muted-foreground'}`}>{h.score ?? '—'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{h.scenario_title}{scope === 'team' ? ` · ${h.agent_name}` : ''}</span>
                      <span className="block text-xs text-muted-foreground">{new Date(h.started_at || h.created_date).toLocaleString()} · {h.difficulty} · {h.duration_seconds ? mmss(h.duration_seconds) : h.status === 'live' ? 'not finished' : '—'}{h.status === 'too_short' ? ' · too short to grade' : ''}</span>
                    </span>
                    {h.scorecard?.outcome && <span className={`text-[11px] rounded-full px-2 py-0.5 ${OUTCOME[h.scorecard.outcome]?.[1] || ''}`}>{OUTCOME[h.scorecard.outcome]?.[0]}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** The live call: microphone in, the character's voice out, captions as you go. */
function LiveCall({ user, scenario, difficulty, grading, maxMinutes, onGrading, onDone, onFail }) {
  const [status, setStatus] = useState('connecting'); // connecting | live | ended
  const [muted, setMuted] = useState(false);
  const [aiTalking, setAiTalking] = useState(false);
  const [youTalking, setYouTalking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState([]); // [{ id, role, text }]
  const [warn, setWarn] = useState('');
  const pcRef = useRef(null); const streamRef = useRef(null); const audioRef = useRef(null);
  const sessionRef = useRef(null); const startRef = useRef(0); const endedRef = useRef(false);
  const order = useRef([]); const byId = useRef(new Map()); const scroller = useRef(null);

  const upsert = useCallback((id, role, fn) => {
    if (!id) return;
    if (!byId.current.has(id)) { byId.current.set(id, { id, role, text: '' }); order.current.push(id); }
    const line = byId.current.get(id);
    fn(line);
    setLines(order.current.map((k) => ({ ...byId.current.get(k) })));
  }, []);

  const teardown = () => {
    try { pcRef.current?.getSenders().forEach((s) => s.track?.stop()); } catch { /* */ }
    try { pcRef.current?.close(); } catch { /* */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* */ }
    if (audioRef.current) { audioRef.current.srcObject = null; }
  };

  const hangUp = useCallback(async () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setStatus('ended');
    teardown();
    onGrading();
    const transcript = order.current.map((k) => byId.current.get(k)).filter((l) => l.text.trim()).map((l) => ({ role: l.role, text: l.text.trim() }));
    try {
      const { data } = await base44.functions.invoke('salesRoleplay', { action: 'finish', session_id: sessionRef.current, transcript, duration_seconds: (Date.now() - startRef.current) / 1000 });
      onDone(data.session);
    } catch (e) {
      onFail(e.message || 'Could not grade the call.');
    }
  }, [onDone, onFail, onGrading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('This browser can\'t do voice calls. Try Chrome or Safari on a recent device.');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
          .catch(() => { throw new Error('Microphone is blocked. Allow the microphone for this site and try again.'); });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const { data } = await base44.functions.invoke('salesRoleplay', { action: 'start', scenario: scenario.key, difficulty });
        sessionRef.current = data.session_id;
        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        const audio = audioRef.current;
        pc.ontrack = (ev) => { audio.srcObject = ev.streams[0]; audio.play().catch(() => {}); };
        pc.addTrack(stream.getTracks()[0], stream);
        const dc = pc.createDataChannel('oai-events');
        dc.onopen = () => {
          startRef.current = Date.now();
          setStatus('live');
          dc.send(JSON.stringify({ type: 'response.create' })); // the character speaks first
        };
        dc.onmessage = (msg) => {
          let ev; try { ev = JSON.parse(msg.data); } catch { return; }
          switch (ev.type) {
            case 'input_audio_buffer.speech_started': setYouTalking(true); upsert(ev.item_id, 'agent', () => {}); break;
            case 'input_audio_buffer.speech_stopped': setYouTalking(false); break;
            case 'conversation.item.input_audio_transcription.delta': upsert(ev.item_id, 'agent', (l) => { l.text += ev.delta || ''; }); break;
            case 'conversation.item.input_audio_transcription.completed': upsert(ev.item_id, 'agent', (l) => { l.text = ev.transcript || l.text; }); break;
            case 'response.output_audio_transcript.delta': case 'response.audio_transcript.delta': setAiTalking(true); upsert(ev.item_id, 'prospect', (l) => { l.text += ev.delta || ''; }); break;
            case 'response.output_audio_transcript.done': case 'response.audio_transcript.done': upsert(ev.item_id, 'prospect', (l) => { l.text = ev.transcript || l.text; }); break;
            case 'output_audio_buffer.stopped': case 'response.done': setAiTalking(false); break;
            case 'output_audio_buffer.started': setAiTalking(true); break;
            case 'error': setWarn(ev.error?.message || 'The voice connection reported a problem.'); break;
            default: break;
          }
        };
        pc.onconnectionstatechange = () => { if (['failed', 'disconnected'].includes(pc.connectionState) && !endedRef.current) setWarn('The connection dropped. Hang up to get graded on what you have so far.'); };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const res = await fetch('https://api.openai.com/v1/realtime/calls', { method: 'POST', body: offer.sdp, headers: { Authorization: `Bearer ${data.client_secret}`, 'Content-Type': 'application/sdp' } });
        if (!res.ok) throw new Error(`Could not connect the call (${res.status}). ${(await res.text()).slice(0, 160)}`);
        await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
      } catch (e) {
        teardown();
        if (!cancelled) onFail(e.message || 'Could not start the call.');
      }
    })();
    return () => { cancelled = true; if (!endedRef.current) teardown(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status !== 'live') return undefined;
    const t = setInterval(() => {
      const s = (Date.now() - startRef.current) / 1000;
      setSeconds(s);
      if (s >= maxMinutes * 60) hangUp();
    }, 500);
    return () => clearInterval(t);
  }, [status, maxMinutes, hangUp]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [lines]);

  const toggleMute = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) { track.enabled = muted; setMuted(!muted); }
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-slate-900 to-slate-950 text-white">
      <audio ref={audioRef} autoPlay playsInline />
      <div className="px-4 sm:px-6 pt-5 pb-3 text-center">
        <p className="text-xs uppercase tracking-wider text-emerald-300">{scenario?.title} · {difficulty}</p>
        <p className="text-2xl font-bold mt-1">{scenario?.persona}</p>
        <p className={`text-sm mt-1 ${status === 'live' && maxMinutes * 60 - seconds <= 60 ? 'text-amber-300 font-semibold' : 'text-slate-400'}`}>
          {grading ? 'Grading your call…' : status === 'connecting' ? 'Connecting…' : `${mmss(seconds)} · ${mmss(Math.max(0, maxMinutes * 60 - seconds))} left`}
        </p>
        {status === 'live' && !grading && maxMinutes * 60 - seconds <= 60 && <p className="text-xs text-amber-300 mt-0.5">Last minute: go for the next step.</p>}
      </div>

      <div className="flex justify-center py-4">
        <div className="relative w-32 h-32">
          <AnimatePresence>
            {aiTalking && !grading && (
              <motion.span key="ring" className="absolute inset-0 rounded-full bg-emerald-400/30" initial={{ scale: 0.9, opacity: 0.8 }} animate={{ scale: 1.35, opacity: 0 }} transition={{ repeat: Infinity, duration: 1.2 }} />
            )}
          </AnimatePresence>
          <div className={`absolute inset-0 rounded-full flex items-center justify-center text-5xl ${aiTalking ? 'bg-emerald-500/30' : 'bg-white/10'}`}>{scenario?.emoji}</div>
        </div>
      </div>
      <p className="text-center text-xs text-slate-400 h-4">{grading ? '' : aiTalking ? `${scenario?.persona.split(' ')[0]} is talking` : youTalking ? 'Listening to you…' : status === 'live' ? 'Your turn' : ''}</p>

      <div ref={scroller} className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-2 max-w-2xl w-full mx-auto">
        {lines.filter((l) => l.text.trim()).map((l) => (
          <div key={l.id} className={`flex ${l.role === 'agent' ? 'justify-end' : 'justify-start'}`}>
            <p className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${l.role === 'agent' ? 'bg-emerald-600 text-white' : 'bg-white/10 text-slate-100'}`}>{l.text}</p>
          </div>
        ))}
        {grading && <div className="flex justify-center pt-4"><Loader2 className="w-6 h-6 animate-spin text-emerald-300" /></div>}
      </div>

      {warn && <p className="text-center text-xs text-amber-300 px-4">{warn}</p>}
      <div className="px-4 pb-6 pt-3 flex items-center justify-center gap-6">
        <button type="button" onClick={toggleMute} disabled={status !== 'live' || grading} aria-label={muted ? 'Unmute' : 'Mute'}
          className={`w-14 h-14 rounded-full flex items-center justify-center ${muted ? 'bg-amber-500' : 'bg-white/15 hover:bg-white/25'} disabled:opacity-40`}>
          {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>
        <button type="button" onClick={hangUp} disabled={grading || status === 'connecting'} aria-label="Hang up"
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center disabled:opacity-40">
          <PhoneOff className="w-7 h-7" />
        </button>
      </div>
      <p className="text-center text-[11px] text-slate-500 pb-3">Goal: {scenario?.goal} Hang up when you're done to get your scorecard.</p>
    </div>
  );
}

function Scorecard({ session, scenario, onAgain, onBack }) {
  const c = session.scorecard || {};
  const st = c.stats || {};
  const [showTranscript, setShowTranscript] = useState(false);
  const score = session.score ?? 0;
  const ring = useMemo(() => { const r = 42; const len = 2 * Math.PI * r; return { r, len, off: len * (1 - score / 100) }; }, [score]);
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="rounded-2xl border bg-card p-5 flex flex-wrap items-center gap-5">
          <svg width="110" height="110" viewBox="0 0 100 100" className="flex-shrink-0">
            <circle cx="50" cy="50" r={ring.r} fill="none" stroke="currentColor" className="text-muted" strokeWidth="9" />
            <circle cx="50" cy="50" r={ring.r} fill="none" stroke="currentColor" className={scoreColor(score)} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={ring.len} strokeDashoffset={ring.off} transform="rotate(-90 50 50)" />
            <text x="50" y="56" textAnchor="middle" className="fill-current" style={{ fontSize: 26, fontWeight: 700 }}>{session.score ?? '—'}</text>
          </svg>
          <div className="flex-1 min-w-[220px]">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{scenario?.emoji} {session.scenario_title} · {session.difficulty}{session.agent_name ? ` · ${session.agent_name}` : ''}</p>
            <p className="text-lg font-semibold mt-1">{c.headline || (session.status === 'too_short' ? 'That call was too short to grade.' : '')}</p>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              {c.outcome && <span className={`rounded-full px-2.5 py-0.5 font-medium ${OUTCOME[c.outcome]?.[1]}`}>{OUTCOME[c.outcome]?.[0]}</span>}
              {'motivation_uncovered' in c && <span className={`rounded-full px-2.5 py-0.5 inline-flex items-center gap-1 ${c.motivation_uncovered ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{c.motivation_uncovered ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} Found their real reason</span>}
              {'asked_for_goal' in c && <span className={`rounded-full px-2.5 py-0.5 inline-flex items-center gap-1 ${c.asked_for_goal ? 'bg-emerald-50 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>{c.asked_for_goal ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} Asked for the next step</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>Back</Button>
            <Button onClick={onAgain} className="gap-1.5"><RotateCcw className="w-4 h-4" /> Try again</Button>
          </div>
        </div>

        {c.categories && (
          <div className="rounded-2xl border bg-card p-5 grid sm:grid-cols-5 gap-4">
            {CATS.map(([k, l]) => {
              const v = Math.max(0, Math.min(10, Number(c.categories[k]) || 0));
              return (
                <div key={k}>
                  <div className="flex justify-between text-sm"><span className="text-muted-foreground">{l}</span><span className="font-semibold">{v}/10</span></div>
                  <div className="h-2 rounded-full bg-muted mt-1.5 overflow-hidden"><div className={`h-full rounded-full ${v >= 8 ? 'bg-emerald-500' : v >= 6 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${v * 10}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['You talked', `${st.talk_ratio ?? 0}%`, 'Aim for 40–50%'],
            ['Questions asked', st.questions ?? 0, 'Open questions find the real reason'],
            ['Filler words', st.filler_words ?? 0, Object.entries(st.filler_detail || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w, n]) => `"${w}" ×${n}`).join(', ') || 'Nice and clean'],
            ['Call length', session.duration_seconds ? mmss(session.duration_seconds) : '—', `Longest stretch: ${st.longest_turn_words ?? 0} words`],
          ].map(([l, v, h]) => (
            <div key={l} className="rounded-2xl border bg-card p-4">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="text-2xl font-bold mt-1">{v}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{h}</p>
            </div>
          ))}
        </div>

        {(c.strengths?.length > 0 || c.moments?.length > 0) && (
          <div className="grid md:grid-cols-[1fr_1.4fr] gap-4">
            <div className="rounded-2xl border bg-card p-5">
              <p className="font-semibold mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> What worked</p>
              <ul className="space-y-2 text-sm">{(c.strengths || []).map((s, i) => <li key={i} className="flex gap-2"><span className="text-emerald-600">•</span>{s}</li>)}</ul>
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <p className="font-semibold mb-2 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-violet-600" /> Say it better</p>
              <div className="space-y-3">
                {(c.moments || []).map((m, i) => (
                  <div key={i} className="text-sm">
                    <p className="italic text-muted-foreground">“{m.quote}”</p>
                    <p className="mt-1">{m.issue}</p>
                    <p className="mt-1 rounded-lg bg-emerald-50 text-emerald-900 px-3 py-2"><span className="font-medium">Try: </span>“{m.try_instead}”</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {c.next_drill && <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm"><span className="font-semibold text-violet-900">Next time: </span>{c.next_drill}</div>}

        <div className="rounded-2xl border bg-card">
          <button type="button" onClick={() => setShowTranscript((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between text-sm font-medium">
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> Full transcript</span>{showTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showTranscript && (
            <div className="border-t p-4 space-y-2">
              {(session.transcript || []).map((l, i) => (
                <p key={i} className="text-sm"><span className={`font-semibold ${l.role === 'agent' ? 'text-emerald-700' : 'text-slate-700'}`}>{l.role === 'agent' ? 'You' : scenario?.persona?.split(' ')[0] || 'Prospect'}:</span> {l.text}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
