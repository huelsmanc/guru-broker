// New: compliance classes and quizzes.
//   start        questions for someone taking a training (without the answers)
//   submit       graded here, so scores can't be made up; a pass earns a certificate
//   certificate  the broker-signed certificate PDF for a pass (made once, then reused)
//   draft        (admin) AI writes a class (lessons + quiz) or a quiz for review in the editor
//   get / save / delete   (admin) edit a training and its questions
//   signer / set_signer   (admin) who signs certificates, and their drawn signature
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole } from '../lib/team.js';
import { InvokeLLM } from '../lib/integrations.js';
import { storePrivate, scopeFolder, readFileBytes } from '../lib/files.js';
import { safeFetch } from '../lib/safeFetch.js';
import { buildCertificate, certificateNumber } from '../lib/certificate.js';

class Problem extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const clip = (v, n) => String(v ?? '').slice(0, n);
const lc = (s) => String(s || '').toLowerCase();
const CATEGORIES = ['fair_housing', 'ethics', 'compliance', 'other'];

function cleanLessons(list) {
  return (Array.isArray(list) ? list : []).slice(0, 30).map((l) => ({
    title: clip(l?.title, 200).trim(),
    body: clip(l?.body, 20000),
    video_url: /^https:\/\//.test(String(l?.video_url || '')) ? clip(l.video_url, 500) : '',
    file_url: /^\/api\/file\?|^https:\/\//.test(String(l?.file_url || '')) ? clip(l.file_url, 800) : '',
    file_name: clip(l?.file_name, 200),
  })).filter((l) => l.title || l.body || l.video_url || l.file_url);
}

function cleanQuestions(list) {
  const out = (Array.isArray(list) ? list : []).slice(0, 100).map((q) => {
    const options = (Array.isArray(q?.options) ? q.options : []).slice(0, 6)
      .map((o) => ({ text: clip(typeof o === 'string' ? o : o?.text, 500).trim(), is_correct: !!o?.is_correct }))
      .filter((o) => o.text);
    return { question_text: clip(q?.question_text ?? q?.question, 1000).trim(), options, explanation: clip(q?.explanation, 2000) };
  }).filter((q) => q.question_text);
  out.forEach((q, i) => {
    if (q.options.length < 2) throw new Problem(`Question ${i + 1} needs at least 2 answers.`);
    if (q.options.filter((o) => o.is_correct).length !== 1) throw new Problem(`Question ${i + 1} needs exactly one correct answer.`);
  });
  return out;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const body = await req.json().catch(() => ({}));
    const E = base44.asServiceRole.entities;
    const superAdmin = me.role === 'super_admin';
    const admin = isAdminRole(me.role) || superAdmin;
    const needAdmin = () => { if (!admin) throw new Problem('Only brokerage admins can do that.', 403); };

    const loadTraining = async (id) => {
      const t = id ? await E.ComplianceTraining.get(String(id)).catch(() => null) : null;
      if (!t || (t.brokerage_id !== me.brokerage_id && !superAdmin)) throw new Problem('Training not found', 404);
      return t;
    };
    const questionsOf = async (id) => (await E.ComplianceQuestion.filter({ training_id: id }, 'order', 200))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
    const correctIndex = (q) => {
      const opts = Array.isArray(q.options) ? q.options : [];
      const i = opts.findIndex((o) => o?.is_correct);
      if (i >= 0) return i;
      return opts.findIndex((o) => (typeof o === 'string' ? o : o?.text) === q.correct_answer);
    };
    const optionTexts = (q) => (Array.isArray(q.options) ? q.options : []).map((o) => (typeof o === 'string' ? o : o?.text || ''));

    switch (body.action) {
      case 'start': {
        const t = await loadTraining(body.training_id);
        const qs = await questionsOf(t.id);
        return Response.json({
          training: { id: t.id, title: t.title, description: t.description, category: t.category, passing_score: t.passing_score ?? 80, kind: t.kind || 'quiz', lessons: t.lessons || [], minutes: t.minutes || null },
          questions: qs.map((q) => ({ id: q.id, question_text: q.question_text, options: optionTexts(q) })),
        });
      }

      case 'submit': {
        const t = await loadTraining(body.training_id);
        const qs = await questionsOf(t.id);
        if (!qs.length) throw new Problem('This training has no questions yet.');
        const given = body.answers && typeof body.answers === 'object' ? body.answers : {};
        if (qs.some((q) => !Number.isInteger(given[q.id]))) throw new Problem(`Answer all ${qs.length} questions first.`);
        const results = qs.map((q) => {
          const right = correctIndex(q);
          return { question_id: q.id, selected: given[q.id], correct_index: right, correct: given[q.id] === right, explanation: q.explanation || '' };
        });
        const score = Math.round((results.filter((r) => r.correct).length / qs.length) * 100);
        const passing = Number(t.passing_score ?? 80);
        const passed = score >= passing;
        const attempt = await E.ComplianceAttempt.create({
          brokerage_id: t.brokerage_id, training_id: t.id, agent_email: lc(me.email), agent_name: me.display_name || me.full_name || me.email,
          score, passed, answers: results.map(({ question_id, selected, correct }) => ({ question_id, selected, correct })),
        });
        if (passed) await E.ComplianceAttempt.update(attempt.id, { certificate_no: certificateNumber(attempt) });
        return Response.json({ score, passed, passing_score: passing, attempt_id: attempt.id, results });
      }

      case 'certificate': {
        const a = await E.ComplianceAttempt.get(String(body.attempt_id || '')).catch(() => null);
        if (!a || (a.brokerage_id !== me.brokerage_id && !superAdmin)) throw new Problem('Certificate not found', 404);
        if (lc(a.agent_email) !== lc(me.email) && !admin) throw new Problem('Certificate not found', 404);
        if (!a.passed) throw new Problem('Certificates are for passed trainings.');
        if (a.certificate_url && !(body.remake && admin)) return Response.json({ url: a.certificate_url });

        const t = await E.ComplianceTraining.get(a.training_id).catch(() => ({ title: 'Training' }));
        const [settings] = await E.BrokerageSettings.filter({ brokerage_id: a.brokerage_id }, '-created_date', 1);
        const [brokerage] = await E.Brokerage.filter({ id: a.brokerage_id }, '-created_date', 1);
        const [agent] = await E.User.filter({ email: lc(a.agent_email) }, '-created_date', 1);
        if (!agent) throw new Problem('That agent is no longer in the brokerage.', 404);
        let logoBytes = null, signatureBytes = null;
        if (brokerage?.logo_url || settings?.logo_url) {
          const src = brokerage?.logo_url || settings.logo_url;
          logoBytes = await (src.startsWith('/api/file') ? readFileBytes(src) : safeFetch(src, { accept: /^image\//, maxBytes: 5e6 }).then((r) => r.bytes)).catch(() => null);
        }
        if (settings?.cert_signature_url) signatureBytes = await readFileBytes(settings.cert_signature_url).catch(() => null);
        const number = a.certificate_no || certificateNumber(a);
        const pdf = await buildCertificate({
          agentName: agent.display_name || agent.full_name || a.agent_name || a.agent_email,
          trainingTitle: t.title, kind: t.kind || 'quiz', score: a.score, date: a.created_date, minutes: t.minutes,
          brokerageName: brokerage?.name || settings?.brokerage_name || '', brandColor: settings?.primary_color,
          logoBytes, number,
          signer: { name: settings?.cert_signer_name || settings?.broker_name || '', title: settings?.cert_signer_title || settings?.broker_title || 'Broker', signatureBytes },
        });
        const name = `Certificate - ${clip(t.title, 60)}.pdf`;
        const url = await storePrivate(scopeFolder(a.brokerage_id, { kind: 'user', id: agent.id }), name, pdf, 'application/pdf');
        await E.ComplianceAttempt.update(a.id, { certificate_url: url, certificate_no: number });
        return Response.json({ url });
      }

      case 'draft': {
        needAdmin();
        const kind = body.kind === 'class' ? 'class' : 'quiz';
        const topic = clip(body.topic, 3000).trim();
        if (!topic) throw new Problem('Describe what it should cover.');
        const nLessons = Math.min(Math.max(Number(body.lessons) || 4, 1), 10);
        const nQuestions = Math.min(Math.max(Number(body.questions) || 8, 3), 25);
        const state = clip(body.state, 40);
        const who = `for licensed real estate agents at a US brokerage. ${state ? `State: ${state} (use that state's rules where they differ).` : 'Keep to rules that apply across the US; say "check your state" where states differ.'} Be accurate: no made-up statute numbers, case names or figures.`;
        const qSchema = { type: 'object', properties: { questions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } }, correct_index: { type: 'integer' }, explanation: { type: 'string' } }, required: ['question', 'options', 'correct_index'] } } }, required: ['questions'] };
        const askQuestions = (about) => InvokeLLM({
          prompt: `Write ${nQuestions} multiple-choice quiz questions ${who}\n${about}\nEach question: 4 answers, exactly one correct, plausible wrong answers, and a one or two sentence explanation. Vary which position is correct.`,
          response_json_schema: qSchema, max_tokens: 5000,
        });
        let r = {};
        let lessons = [];
        if (kind === 'class') {
          // Outline first, then the lessons and the quiz are written side by side (keeps it quick).
          const outline = await InvokeLLM({
            prompt: `Plan a short training class ${who}\nTopic: ${topic}\nGive a title (under 60 characters), a one-sentence description, an estimate of minutes to complete, and ${nLessons} lessons, each with a title and 3-5 key points it must teach.`,
            response_json_schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, minutes: { type: 'integer' }, lessons: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } }, required: ['title', 'points'] } } }, required: ['title', 'lessons'] },
            max_tokens: 2000,
          });
          const plan = (outline.lessons || []).slice(0, nLessons);
          const planText = plan.map((l, i) => `Lesson ${i + 1}: ${l.title}\n${(l.points || []).map((x) => `- ${x}`).join('\n')}`).join('\n');
          const [bodies, qs] = await Promise.all([
            Promise.all(plan.map((l, i) => InvokeLLM({
              prompt: `Write lesson ${i + 1} of the class "${outline.title}" ${who}\nLesson title: ${l.title}\nIt must teach:\n${(l.points || []).map((x) => `- ${x}`).join('\n')}\nWrite 200-350 words in plain language: short paragraphs, "- " bullet lines for lists, and end with one line starting "Key takeaway:". Plain text only, no headings, don't repeat the title.`,
              max_tokens: 1200,
            }).catch(() => ''))),
            askQuestions(`They test this class:\n${planText}`),
          ]);
          lessons = plan.map((l, i) => ({ title: l.title, body: String(bodies[i] || '').trim() }));
          r = { title: outline.title, description: outline.description, minutes: outline.minutes, questions: qs.questions };
        } else {
          const [meta, qs] = await Promise.all([
            InvokeLLM({ prompt: `A quiz ${who}\nTopic: ${topic}\nGive a title (under 60 characters), a one-sentence description and minutes to complete.`, response_json_schema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, minutes: { type: 'integer' } }, required: ['title'] }, max_tokens: 400 }).catch(() => ({})),
            askQuestions(`Topic: ${topic}`),
          ]);
          r = { ...meta, questions: qs.questions };
        }
        const questions = (r.questions || []).map((q) => ({
          question_text: clip(q.question, 1000),
          options: (q.options || []).slice(0, 6).map((text, i) => ({ text: clip(text, 500), is_correct: i === Number(q.correct_index) })),
          explanation: clip(q.explanation, 2000),
        })).filter((q) => q.question_text && q.options.length >= 2 && q.options.some((o) => o.is_correct));
        return Response.json({
          draft: {
            kind, type: 'ai_generated', title: clip(body.title || r.title, 200), description: clip(r.description, 1000),
            minutes: Number.isFinite(Number(r.minutes)) ? Math.min(Math.max(Math.round(r.minutes), 1), 600) : null,
            lessons: kind === 'class' ? cleanLessons(lessons) : [], questions,
          },
        });
      }

      case 'get': {
        needAdmin();
        const t = await loadTraining(body.training_id);
        const qs = await questionsOf(t.id);
        return Response.json({
          training: { ...t, kind: t.kind || 'quiz', lessons: t.lessons || [] },
          questions: qs.map((q) => {
            const right = correctIndex(q);
            return { id: q.id, question_text: q.question_text, explanation: q.explanation || '', options: optionTexts(q).map((text, i) => ({ text, is_correct: i === right })) };
          }),
        });
      }

      case 'save': {
        needAdmin();
        const t = body.training || {};
        const title = clip(t.title, 200).trim();
        if (!title) throw new Problem('Give it a title.');
        const kind = t.kind === 'class' ? 'class' : 'quiz';
        const lessons = kind === 'class' ? cleanLessons(t.lessons) : [];
        if (kind === 'class' && !lessons.length) throw new Problem('Add at least one lesson, or make it a quiz.');
        const questions = cleanQuestions(body.questions);
        if (!questions.length) throw new Problem('Add at least one question.');
        const passing = Math.min(Math.max(Math.round(Number(t.passing_score) || 80), 1), 100);
        const fields = {
          title, description: clip(t.description, 1000), category: CATEGORIES.includes(t.category) ? t.category : 'compliance',
          passing_score: passing, kind, lessons, minutes: Number(t.minutes) > 0 ? Math.min(Math.round(Number(t.minutes)), 600) : null,
          type: t.type === 'ai_generated' ? 'ai_generated' : 'admin_created',
        };
        let saved;
        if (t.id) {
          await loadTraining(t.id);
          saved = await E.ComplianceTraining.update(t.id, fields);
          for (const q of await questionsOf(t.id)) await E.ComplianceQuestion.delete(q.id);
        } else {
          saved = await E.ComplianceTraining.create({ ...fields, brokerage_id: me.brokerage_id });
        }
        for (let i = 0; i < questions.length; i += 1) {
          const q = questions[i];
          await E.ComplianceQuestion.create({
            training_id: saved.id, question_text: q.question_text, question_type: 'multiple_choice', options: q.options,
            correct_answer: q.options.find((o) => o.is_correct).text, explanation: q.explanation, order: i,
          });
        }
        return Response.json({ training: saved });
      }

      case 'delete': {
        needAdmin();
        const t = await loadTraining(body.training_id);
        for (const q of await questionsOf(t.id)) await E.ComplianceQuestion.delete(q.id);
        await E.ComplianceTraining.delete(t.id); // earned certificates stay valid
        return Response.json({ ok: true });
      }

      case 'signer': {
        needAdmin();
        const [s] = await E.BrokerageSettings.filter({ brokerage_id: me.brokerage_id }, '-created_date', 1);
        return Response.json({
          name: s?.cert_signer_name || s?.broker_name || '', title: s?.cert_signer_title || s?.broker_title || '',
          signature_url: s?.cert_signature_url || null,
        });
      }

      case 'set_signer': {
        needAdmin();
        if (!me.brokerage_id) throw new Problem('No brokerage');
        let [s] = await E.BrokerageSettings.filter({ brokerage_id: me.brokerage_id }, '-created_date', 1);
        if (!s) s = await E.BrokerageSettings.create({ brokerage_id: me.brokerage_id });
        const patch = { cert_signer_name: clip(body.name, 120).trim(), cert_signer_title: clip(body.title, 120).trim() };
        if (body.clear_signature) patch.cert_signature_url = null;
        if (body.signature) {
          const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.signature));
          if (!m) throw new Problem('Signature must be a drawn picture.');
          const bytes = Buffer.from(m[1], 'base64');
          if (bytes.length > 400000) throw new Problem('That signature picture is too big.');
          // Kept in the signer's own private folder: admins can see it, agents can't download it.
          patch.cert_signature_url = await storePrivate(scopeFolder(me.brokerage_id, { kind: 'user', id: me.id }), 'certificate-signature.png', bytes, 'image/png');
        }
        await E.BrokerageSettings.update(s.id, patch);
        return Response.json({ ok: true, name: patch.cert_signer_name, title: patch.cert_signer_title, signature_url: patch.cert_signature_url ?? s.cert_signature_url ?? null });
      }

      default:
        throw new Problem('Unknown action');
    }
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('training:', error);
    return Response.json({ error: error.message || 'Something went wrong' }, { status });
  }
};
