// Server-side stand-in for `createClientFromRequest` / `createClient` from the Base44 SDK.
// Ported backend functions keep their original code: `base44.auth.me()`,
// `base44.entities.X...` (runs as the signed-in user, so security rules apply),
// `base44.asServiceRole.entities.X...` (full access), `integrations.Core.*`, and
// `functions.invoke(...)`.

import { createClient as createSupabase } from '@supabase/supabase-js';
import { makeEntities, fromRow } from '../../shared/entities.js';
import { Core } from './integrations.js';

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
  let cachedUser;

  const auth = {
    async me() {
      if (cachedUser) return cachedUser;
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
      cachedUser = { ...fromRow(profile || {}), id: data.user.id, email: data.user.email };
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
      const next = opts.nextUrl ? `?next=${encodeURIComponent(opts.nextUrl)}` : '';
      const redirectTo = `${appUrl()}/reset-password${next}`;
      const addr = email.toLowerCase().trim();
      const { data, error } = await admin.auth.admin.inviteUserByEmail(addr, { redirectTo });
      if (error && !/already been registered|already exists/i.test(error.message)) throw new Error(error.message);
      const userId = data?.user?.id;
      if (userId) await admin.from('profiles').update({ role, brokerage_id: brokerageId }).eq('id', userId);
      return { success: true, already_registered: !userId };
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
