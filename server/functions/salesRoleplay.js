// New: voice role-play for the AI Sales Coach (OpenAI Realtime, speech to speech).
//   { action: 'scenarios' }                          -> characters and difficulty levels
//   { action: 'start', scenario, difficulty }        -> { session_id, client_secret } for the browser's
//        live voice connection. The character's private brief stays on the server.
//   { action: 'finish', session_id, transcript, duration_seconds } -> grades the call, saves it
import { createHash } from 'node:crypto';
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';
import { SCENARIOS, DIFFICULTIES, scenarioCard, personaInstructions, callStats, SCORECARD_SCHEMA, scoringPrompt } from '../../shared/roleplay.js';

const MAX_MINUTES = 5;

// Try the configured models first, then known fallbacks (OpenAI renames these from time to time).
async function mintClientSecret({ instructions, voice, email }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('Voice role-play needs OPENAI_API_KEY in Vercel.'), { status: 400 });
  const models = [...new Set([process.env.OPENAI_REALTIME_MODEL, 'gpt-realtime', 'gpt-realtime-2.1', 'gpt-realtime-2'].filter(Boolean))];
  const transcribers = [...new Set([process.env.OPENAI_TRANSCRIBE_MODEL, 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe', 'whisper-1'].filter(Boolean))];
  const attempts = [];
  for (const m of models) attempts.push({ m, t: transcribers[0], vad: true });
  for (const t of transcribers.slice(1)) attempts.push({ m: models[0], t, vad: true });
  attempts.push({ m: models[0], t: transcribers[0], vad: false });
  let lastMsg = '';
  for (const a of attempts) {
    const session = {
      type: 'realtime',
      model: a.m,
      instructions,
      audio: {
        input: { transcription: { model: a.t }, ...(a.vad ? { turn_detection: { type: 'semantic_vad', eagerness: 'medium' } } : {}) },
        output: { voice },
      },
    };
    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': createHash('sha256').update(String(email || '').toLowerCase()).digest('hex'),
      },
      body: JSON.stringify({ session }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.value || data.client_secret?.value)) return { value: data.value || data.client_secret.value, model: a.m };
    lastMsg = data?.error?.message || `OpenAI said ${res.status}`;
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`OpenAI refused the key: ${lastMsg}`), { status: 502 });
    if (res.status === 429) throw Object.assign(new Error(`OpenAI is rate limiting the account: ${lastMsg}`), { status: 429 });
    console.error('salesRoleplay: client secret attempt failed', a, lastMsg);
  }
  throw Object.assign(new Error(`Could not start a voice session: ${lastMsg}`), { status: 502 });
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const body = await req.json().catch(() => ({}));
    const e = base44.asServiceRole.entities;

    if (body.action === 'scenarios') {
      return Response.json({ scenarios: SCENARIOS.map(scenarioCard), difficulties: DIFFICULTIES, max_minutes: MAX_MINUTES });
    }

    if (body.action === 'start') {
      const s = SCENARIOS.find((x) => x.key === body.scenario);
      if (!s) return Response.json({ error: 'Pick a scenario' }, { status: 400 });
      const difficulty = DIFFICULTIES[body.difficulty] ? body.difficulty : 'realistic';
      const secret = await mintClientSecret({ instructions: personaInstructions(s, difficulty, me.full_name), voice: s.voice, email: me.email });
      const rec = await e.RoleplaySession.create({
        brokerage_id: me.brokerage_id || null, agent_email: String(me.email).toLowerCase(), agent_name: me.display_name || me.full_name || me.email,
        scenario: s.key, scenario_title: s.title, difficulty, status: 'live', started_at: new Date().toISOString(),
      });
      return Response.json({ session_id: rec.id, client_secret: secret.value, model: secret.model, max_minutes: MAX_MINUTES, persona: s.persona });
    }

    if (body.action === 'finish') {
      const [rec] = await e.RoleplaySession.filter({ id: String(body.session_id || '') }, '-created_date', 1);
      if (!rec || String(rec.agent_email).toLowerCase() !== String(me.email).toLowerCase()) return Response.json({ error: 'Session not found' }, { status: 404 });
      const s = SCENARIOS.find((x) => x.key === rec.scenario);
      const transcript = (Array.isArray(body.transcript) ? body.transcript : [])
        .filter((l) => l && ['agent', 'prospect'].includes(l.role) && String(l.text || '').trim())
        .slice(0, 400).map((l) => ({ role: l.role, text: String(l.text).slice(0, 2000) }));
      const duration = Math.max(0, Math.min(MAX_MINUTES * 60 + 60, Math.round(Number(body.duration_seconds) || 0)));
      const stats = callStats(transcript);
      const agentTurns = transcript.filter((l) => l.role === 'agent').length;
      let scorecard = null; let score = null;
      if (agentTurns >= 2) {
        scorecard = await InvokeLLM({ max_tokens: 2500, response_json_schema: SCORECARD_SCHEMA, prompt: scoringPrompt(s, rec.difficulty, transcript, stats) });
        score = Math.max(0, Math.min(100, Math.round(Number(scorecard?.score) || 0)));
      }
      const saved = await e.RoleplaySession.update(rec.id, {
        status: scorecard ? 'scored' : 'too_short', ended_at: new Date().toISOString(), duration_seconds: duration,
        transcript, score, scorecard: scorecard ? { ...scorecard, stats } : { stats },
      });
      return Response.json({ session: saved });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('salesRoleplay:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
