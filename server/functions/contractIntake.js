// New: the intake questionnaire for filling a contract form with AI. The AI reads the blank form
// once and writes the questions that form needs; they are saved on the form and reused.
//   { form_id, text, force? } -> { form_summary, questions: [...] }   (saved on the form)
//   { name, text }             -> same, for a one-off uploaded document (not saved)
// The browser sends the form's text (it already reads PDFs to find the blanks).
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';
import { INTAKE_SCHEMA, intakePrompt, QUESTION_TYPES, FACT_KEYS } from '../../shared/contractIntake.js';

const MAX_CHARS = 60000;

function tidy(out) {
  const seen = new Set();
  const questions = (out?.questions || []).map((q) => ({
    key: String(q.key || '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 60),
    label: String(q.label || '').slice(0, 160),
    group: String(q.group || 'Other').slice(0, 40),
    type: QUESTION_TYPES.includes(q.type) ? q.type : 'text',
    options: Array.isArray(q.options) ? q.options.map((o) => String(o).slice(0, 80)).filter(Boolean).slice(0, 12) : [],
    help: q.help ? String(q.help).slice(0, 200) : '',
    source: FACT_KEYS[q.source] ? q.source : 'none',
  })).filter((q) => q.key && q.label && !seen.has(q.key) && seen.add(q.key)).slice(0, 45);
  return { form_summary: String(out?.form_summary || '').slice(0, 300), questions };
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();
    const { form_id, text, force, name } = await req.json().catch(() => ({}));
    // A library form (read as the signed-in person: only forms they can see), or a one-off
    // document an agent uploaded (questions aren't saved anywhere).
    const form = form_id ? await base44.entities.ContractForm.get(String(form_id)).catch(() => null) : { name: String(name || 'Document').slice(0, 120) };
    if (!form) return Response.json({ error: 'Form not found' }, { status: 404 });
    if (form.id && form.intake?.questions?.length && !force) return Response.json(form.intake);
    const body = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (body.length < 200) return Response.json({ error: "Couldn't read any text in this form. It may be a scanned image; set up its boxes by hand instead." }, { status: 422 });
    const out = tidy(await InvokeLLM({ max_tokens: 6000, response_json_schema: INTAKE_SCHEMA, prompt: intakePrompt(form.name, body.slice(0, MAX_CHARS)) }));
    if (!out.questions.length) return Response.json({ error: 'The AI could not find anything to ask for this form.' }, { status: 422 });
    const intake = { ...out, made_at: new Date().toISOString() };
    if (form.id) await base44.asServiceRole.entities.ContractForm.update(form.id, { intake });
    return Response.json(intake);
  } catch (error) {
    console.error('contractIntake:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
