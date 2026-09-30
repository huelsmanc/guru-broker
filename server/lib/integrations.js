// Replacements for Base44's built-in "Core" integrations.
//   InvokeLLM            -> Claude (Anthropic) or ChatGPT (OpenAI), chosen by AI_PROVIDER
//   SendEmail            -> Resend
//   UploadFile           -> Supabase Storage, public bucket
//   UploadPrivateFile    -> Supabase Storage, private bucket
//   CreateFileSignedUrl  -> short-lived link to a private file
//
// Env vars: AI_PROVIDER (anthropic | openai, default anthropic), ANTHROPIC_API_KEY,
// ANTHROPIC_MODEL, OPENAI_API_KEY, OPENAI_MODEL, RESEND_API_KEY, EMAIL_FROM.

import { adminClient } from './base44.js';

// ---------------------------------------------------------------------------
// AI

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1';

function providerOrder(preferred) {
  const first = (preferred || process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const all = first === 'openai' ? ['openai', 'anthropic'] : ['anthropic', 'openai'];
  return all.filter((p) => (p === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY));
}

/**
 * Same inputs and outputs as Base44's InvokeLLM:
 *   prompt                    text prompt
 *   response_json_schema      if given, returns a parsed object matching it; otherwise a string
 *   add_context_from_internet let the model search the web first
 *   file_urls                 images or PDFs to include
 *   provider                  optional per-call override: 'anthropic' | 'openai'
 *   system, max_tokens        optional extras
 */
export async function InvokeLLM(params = {}) {
  const order = providerOrder(params.provider);
  if (!order.length) throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY.');
  let lastErr;
  for (const p of order) {
    try {
      return p === 'openai' ? await openaiInvoke(params) : await anthropicInvoke(params);
    } catch (err) {
      console.error(`InvokeLLM via ${p} failed:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr;
}

function fileKind(url) {
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g|gif|webp)$/.test(clean)) return 'image';
  return 'other';
}

async function anthropicCall(body) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic error ${res.status}`);
  return data;
}

async function anthropicInvoke({ prompt, response_json_schema, add_context_from_internet, file_urls, system, max_tokens }) {
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL;
  const content = [];
  for (const url of file_urls || []) {
    const kind = fileKind(url);
    if (kind === 'image') content.push({ type: 'image', source: { type: 'url', url } });
    else if (kind === 'pdf') content.push({ type: 'document', source: { type: 'url', url } });
  }
  content.push({ type: 'text', text: String(prompt || '') });
  const base = { model, max_tokens: max_tokens || 4096, ...(system ? { system } : {}) };

  let context = '';
  if (add_context_from_internet) {
    const searched = await anthropicCall({
      ...base,
      messages: [{ role: 'user', content }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    });
    context = searched.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    if (!response_json_schema) return context;
  }

  if (response_json_schema) {
    const messages = [{ role: 'user', content }];
    if (context) messages.push({ role: 'assistant', content: context }, { role: 'user', content: 'Now give the final answer in the required format.' });
    const data = await anthropicCall({
      ...base,
      messages,
      tools: [{ name: 'respond', description: 'Return the answer in the required structure.', input_schema: normalizeSchema(response_json_schema) }],
      tool_choice: { type: 'tool', name: 'respond' },
    });
    const block = data.content.find((b) => b.type === 'tool_use');
    if (!block) throw new Error('Model did not return structured output');
    return block.input;
  }

  const data = await anthropicCall({ ...base, messages: [{ role: 'user', content }] });
  return data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

async function openaiInvoke({ prompt, response_json_schema, add_context_from_internet, file_urls, system, max_tokens }) {
  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const content = [{ type: 'input_text', text: String(prompt || '') }];
  for (const url of file_urls || []) {
    const kind = fileKind(url);
    if (kind === 'image') content.push({ type: 'input_image', image_url: url });
    else if (kind === 'pdf') content.push({ type: 'input_file', file_url: url });
  }
  const body = {
    model,
    input: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content },
    ],
    ...(max_tokens ? { max_output_tokens: max_tokens } : {}),
    ...(add_context_from_internet ? { tools: [{ type: 'web_search' }] } : {}),
    ...(response_json_schema
      ? { text: { format: { type: 'json_schema', name: 'response', schema: normalizeSchema(response_json_schema), strict: false } } }
      : {}),
  };
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI error ${res.status}`);
  const text = data.output_text ?? (data.output || [])
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('\n');
  if (!response_json_schema) return text;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Model did not return valid JSON');
  }
}

// Base44 schemas are loose JSON Schema; both providers want a top-level object.
function normalizeSchema(schema) {
  if (!schema || typeof schema !== 'object') return { type: 'object', properties: {} };
  if (schema.type === 'object') return schema;
  return { type: 'object', properties: { result: schema }, required: ['result'] };
}

// ---------------------------------------------------------------------------
// Email

export async function SendEmail({ to, subject, body, from_name, reply_to }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const fromAddr = process.env.EMAIL_FROM || 'Go Broker Hub <noreply@gurubroker.app>';
  const from = from_name ? `${from_name} <${fromAddr.replace(/^.*<|>$/g, '')}>` : fromAddr;
  const isHtml = /<[a-z][\s\S]*>/i.test(body || '');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      ...(isHtml ? { html: body } : { text: body || '' }),
      ...(reply_to ? { reply_to } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Email failed (${res.status})`);
  return { success: true, id: data.id };
}

// ---------------------------------------------------------------------------
// Files

function safeName(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
}

async function toBody(file) {
  if (!file) throw new Error('No file provided');
  if (typeof file === 'string') return { body: Buffer.from(file), type: 'application/octet-stream', name: 'file' };
  if (file instanceof Uint8Array || Buffer.isBuffer(file)) return { body: file, type: 'application/octet-stream', name: 'file' };
  // Blob / File
  return { body: Buffer.from(await file.arrayBuffer()), type: file.type || 'application/octet-stream', name: file.name || 'file' };
}

export async function UploadFile({ file, filename, content_type }) {
  const f = await toBody(file);
  const path = `${Date.now()}-${crypto.randomUUID()}-${safeName(filename || f.name)}`;
  const sb = adminClient();
  const { error } = await sb.storage.from('public-files').upload(path, f.body, { contentType: content_type || f.type });
  if (error) throw new Error(error.message);
  return { file_url: sb.storage.from('public-files').getPublicUrl(path).data.publicUrl };
}

export async function UploadPrivateFile({ file, filename, content_type }) {
  const f = await toBody(file);
  const path = `${Date.now()}-${crypto.randomUUID()}-${safeName(filename || f.name)}`;
  const { error } = await adminClient().storage.from('private-files').upload(path, f.body, { contentType: content_type || f.type });
  if (error) throw new Error(error.message);
  return { file_uri: `private-files/${path}` };
}

export async function CreateFileSignedUrl({ file_uri, expires_in = 300 }) {
  const path = String(file_uri || '').replace(/^private-files\//, '');
  const { data, error } = await adminClient().storage.from('private-files').createSignedUrl(path, expires_in);
  if (error) throw new Error(error.message);
  return { signed_url: data.signedUrl };
}

export const Core = { InvokeLLM, SendEmail, UploadFile, UploadPrivateFile, CreateFileSignedUrl };
