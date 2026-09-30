// Loads and runs a server function by name. Shared by /api/fn and /api/hooks.

import { FUNCTIONS } from '../functions/index.js';
import { setInvoker, SERVICE_HEADER, isServiceRequest } from './base44.js';

// Only the system (scheduled jobs, database automations, other functions) may run these.
// Some are the reminder jobs and automations; the rest are old Base44 functions nothing
// in the app calls any more, several of which skipped login checks.
export const SERVICE_ONLY = new Set([
  // scheduled
  'closingDateReminder', 'sendSigningReminders', 'sendCultureEventReminders', 'mlsSync',
  'licenseAlerts', 'payoutSync',
  // database automations
  'notifyAgentsNewTraining', 'notifyDocumentActivity', 'applyDefaultChecklists', 'notifyNewSocialMessage', 'notifySignatureUpdate',
  // unused by the app
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
  try {
    const res = await mod.default(request);
    return res instanceof Response ? res : Response.json(res ?? null);
  } catch (err) {
    console.error(`[fn:${name}]`, err);
    return Response.json({ error: err.message || 'Server error' }, { status: err.status || 500 });
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

