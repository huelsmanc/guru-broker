// Loads and runs a server function by name. Shared by /api/fn and /api/hooks.

import { FUNCTIONS } from '../functions/index.js';
import { setInvoker, SERVICE_HEADER, isServiceRequest } from './base44.js';
import { logError, emailFromRequest } from './errors.js';

// The error functions themselves are never logged (a broken error log must not loop).
const NOT_LOGGED = new Set(['reportError', 'appErrors']);

// Only the system (scheduled jobs, database automations, other functions) may run these.
// Some are the reminder jobs and automations; the rest are old Base44 functions nothing
// in the app calls any more, several of which skipped login checks.
export const SERVICE_ONLY = new Set([
  // scheduled
  'closingDateReminder', 'sendSigningReminders', 'sendCultureEventReminders', 'mlsSync',
  'licenseAlerts', 'payoutSync', 'chatDigest', 'printQueue',
  // database automations
  'notifyAgentsNewTraining', 'notifyDocumentActivity', 'applyDefaultChecklists', 'dealChatSync', 'pushOnMessage', 'notifyNewSocialMessage', 'notifySignatureUpdate',
  // unused by the app
  'notifyOnMention', 'notifyNewSocialMessage',
  'cancelESignDocument', 'createMasterAdmin', 'createSubmission', 'decryptDocument', 'detectPDFFields',
  'encryptDocument', 'exportCommissionSummary', 'fixDisplayNames', 'generateAndSendOTP',
  'generateConversationSummary', 'generateDocumentHash', 'generateFinalizedPDF', 'generateMultiPagePDF',
  'getPublicDocument', 'getPublicDocumentBySlug', 'getPublicDocumentByToken', 'getPublicDocumentForSigning',
  'getPublicDocumentSecure', 'notifyDocumentMention', 'notifyMentions', 'sendPushNotification',
  'sendSignerEmails', 'submitPublicSignature', 'updateUserBadges', 'verifyOTP',
]);

// The ported functions were written for Deno; give them the one Deno API they use.
if (!globalThis.Deno) {
  globalThis.Deno = {
    env: {
      get(key) {
        if (key === 'BASE44_APP_URL') return process.env.APP_URL || process.env.BASE44_APP_URL;
        return process.env[key];
      },
    },
  };
}

export async function run(name, request) {
  const load = FUNCTIONS[name];
  if (!load) return Response.json({ error: `Unknown function: ${name}` }, { status: 404 });
  if (SERVICE_ONLY.has(name) && !isServiceRequest(request)) {
    return Response.json({ error: 'Not available' }, { status: 403 });
  }
  const mod = await load();
  const who = { userEmail: emailFromRequest(request), userAgent: request.headers.get('user-agent'), url: request.headers.get('referer') };
  try {
    const out = await mod.default(request);
    const res = out instanceof Response ? out : Response.json(out ?? null);
    // Most functions catch their own errors and answer 500: record those for the error list.
    if (res.status >= 500 && !NOT_LOGGED.has(name)) {
      let message = `Answered ${res.status}`;
      try { const body = await res.clone().json(); if (body?.error) message = String(body.error); } catch { /* not JSON */ }
      await logError({ source: 'server', location: name, message, ...who });
    }
    return res;
  } catch (err) {
    console.error(`[fn:${name}]`, err);
    const status = err.status || 500;
    if (status >= 500 && !NOT_LOGGED.has(name)) await logError({ source: 'server', location: name, message: err.message || 'Server error', detail: err.stack, ...who });
    return Response.json({ error: err.message || 'Server error', ...(err.code ? { code: err.code } : {}) }, { status });
  }
}

// Lets functions call each other (`base44.functions.invoke(...)`) without an HTTP round trip.
setInvoker(async (name, payload, { token }) => {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) headers.set('authorization', `Bearer ${token}`);
  else if (process.env.HOOK_SECRET) headers.set(SERVICE_HEADER, process.env.HOOK_SECRET);
  const req = new Request(`${process.env.APP_URL || 'http://localhost'}/api/fn/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload ?? {}),
  });
  const res = await run(name, req);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const e = new Error((data && data.error) || `Function ${name} failed`);
    e.status = res.status;
    e.response = { status: res.status, data };
    throw e;
  }
  return { data, status: res.status };
});

