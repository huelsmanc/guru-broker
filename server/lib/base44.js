// Server-side stand-in for `createClientFromRequest` / `createClient` from the Base44 SDK.
// Ported backend functions keep their original code: `base44.auth.me()`,
// `base44.entities.X...` (runs as the signed-in user, so security rules apply),
// `base44.asServiceRole.entities.X...` (full access), `integrations.Core.*`, and
// `functions.invoke(...)`.

import { createClient as createSupabase } from '@supabase/supabase-js';
import { makeEntities, fromRow } from '../../shared/entities.js';
import { Core } from './integrations.js';
import { tokenClaims, secondStepNeeded, sessionConfirmed } from './twostep.js';

const URL_ = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

let _admin;
export function adminClient() {
  if (!_admin) {
    if (!URL_() || !SERVICE()) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
    _admin = createSupabase(URL_(), SERVICE(), { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return _admin;
}

function userClient(token) {
  return createSupabase(URL_(), ANON(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

let _anon;
function anonClient() {
  return (_anon ||= createSupabase(URL_(), ANON(), { auth: { persistSession: false, autoRefreshToken: false } }));
}

function bearer(req) {
  const h = req.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : null;
}

// Set by api/fn/[name].js so functions can call each other in-process.
let invoker = null;
export function setInvoker(fn) { invoker = fn; }

function buildClient({ token, asService }) {
  const admin = adminClient();
  // Signed-in user: their own access. No user: anonymous access (security rules deny).
  // App-credential clients (`createClient()`): full access.
  const scoped = asService ? null : token ? userClient(token) : anonClient();
  let cachedUser, cachedRow, stepChecked;

  // 2-step sign-in: people who must confirm a second step get nothing until they have.
  // Only the 2-step route itself skips this (it is how they confirm).
  async function checkSecondStep(user) {
    if (stepChecked) return;
    const claims = tokenClaims(token);
    // Supabase only accepts real sign-in tokens, which always carry these claims.
    if (claims && claims.aal !== 'aal2' && (await secondStepNeeded(admin, cachedRow)) && !(await sessionConfirmed(admin, user.id, claims))) {
      const e = new Error('Confirm the second sign-in step first.');
      e.status = 401;
      e.code = 'second_step_required';
      throw e;
    }
    stepChecked = true;
  }

  const auth = {
    async me({ secondStep = true } = {}) {
      if (cachedUser) {
        if (secondStep) await checkSecondStep(cachedUser);
        return cachedUser;
      }
      if (!token) {
        const e = new Error('Not authenticated');
        e.status = 401;
        throw e;
      }
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data?.user) {
        const e = new Error('Not authenticated');
        e.status = 401;
        throw e;
      }
      const { data: profile } = await admin.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
      cachedRow = profile || null;
      cachedUser = { ...fromRow(profile || {}), id: data.user.id, email: data.user.email };
      if (secondStep) await checkSecondStep(cachedUser);
      return cachedUser;
    },
    async isAuthenticated() {
      try { await auth.me(); return true; } catch { return false; }
    },
    async updateMe(patch) {
      const me = await auth.me();
      return serviceEntities.User.update(me.id, patch);
    },
  };

  const getEmail = async () => {
    try { return (await auth.me()).email?.toLowerCase(); } catch { return null; }
  };

  const serviceEntities = makeEntities(() => admin, { getEmail });
  const entities = scoped ? makeEntities(() => scoped, { getEmail }) : serviceEntities;

  const functions = {
    async invoke(name, payload) {
      if (!invoker) throw new Error('Function invoker not ready');
      return invoker(name, payload, { token });
    },
  };

  const users = {
    // Sends a Supabase invite email. The person sets a password, then lands on nextUrl.
    async inviteUser(email, role = 'user', opts = {}) {
      const me = await auth.me().catch(() => null);
      const isSuper = asService || me?.role === 'super_admin';
      if (role === 'super_admin' && !isSuper) throw Object.assign(new Error('Only a super admin can grant that role'), { status: 403 });
      const brokerageId = isSuper ? (opts.brokerage_id ?? me?.brokerage_id ?? null) : me?.brokerage_id ?? null;
      // welcome=1: the set-password page greets them as a new member instead of "reset your password".
      const redirectTo = `${appUrl()}/reset-password?welcome=1${opts.nextUrl ? `&next=${encodeURIComponent(opts.nextUrl)}` : ''}`;
      const addr = email.toLowerCase().trim();
      const fullName = String(opts.full_name || '').trim().slice(0, 120) || null;
      const { data, error } = await admin.auth.admin.inviteUserByEmail(addr, { redirectTo, data: fullName ? { full_name: fullName } : undefined });
      if (error && !/already been registered|already exists/i.test(error.message)) throw new Error(error.message);
      const userId = data?.user?.id;
      if (userId) {
        await admin.from('profiles').update({ role, brokerage_id: brokerageId, ...(fullName ? { full_name: fullName, display_name: fullName } : {}) }).eq('id', userId);
        return { success: true, already_registered: false };
      }
      // Already has a login: place them if they don't belong to a brokerage yet (e.g. invited
      // before), and send a sign-in link instead of an invite.
      const { data: prof } = await admin.from('profiles').select('id, brokerage_id, role, full_name, display_name').eq('email', addr).maybeSingle();
      if (prof && !prof.brokerage_id && brokerageId && prof.role !== 'super_admin') {
        await admin.from('profiles').update({ role, brokerage_id: brokerageId }).eq('id', prof.id);
      }
      if (prof && fullName && !prof.full_name && !prof.display_name) {
        await admin.from('profiles').update({ full_name: fullName, display_name: fullName }).eq('id', prof.id);
      }
      await admin.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: false, emailRedirectTo: `${appUrl()}${opts.nextUrl || '/Dashboard'}` } }).catch(() => {});
      return { success: true, already_registered: true };
    },
  };

  const client = { auth, entities, integrations: { Core }, functions, users };
  client.asServiceRole = { entities: serviceEntities, integrations: { Core }, functions, users, auth };
  return client;
}

// Scheduled jobs and database automations run with full access, the way Base44
// automations did. The dispatcher marks those requests with the shared secret.
export const SERVICE_HEADER = 'x-gbh-service';
export function isServiceRequest(req) {
  const secret = process.env.HOOK_SECRET;
  return !!secret && req.headers.get(SERVICE_HEADER) === secret;
}

export function createClientFromRequest(req) {
  if (isServiceRequest(req)) return buildClient({ token: null, asService: true });
  return buildClient({ token: bearer(req) });
}

// Old `createClient({ appId, apiKey })` calls used the app's own credentials: service access.
export function createClient() {
  return buildClient({ token: null, asService: true });
}

export function appUrl() {
  return (process.env.APP_URL || process.env.BASE44_APP_URL || 'https://gurubroker.app').replace(/\/$/, '');
}
