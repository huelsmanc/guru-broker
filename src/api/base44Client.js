// Drop-in replacement for the Base44 SDK client.
// Pages keep importing `base44` from here; underneath it now talks to your own
// Supabase project and your own /api routes on Vercel.

import { createClient } from '@supabase/supabase-js';
import { makeEntities, fromRow } from '../../shared/entities.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Without these the app can't start; main.jsx shows a setup message instead of a blank page.
export const CONFIG_MISSING = !SUPABASE_URL || !SUPABASE_ANON_KEY;
if (CONFIG_MISSING) console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. See SETUP.md.');

export const supabase = createClient(SUPABASE_URL || 'https://missing-config.supabase.co', SUPABASE_ANON_KEY || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// File links (/api/file?p=...) are opened by the browser itself (<img>, <iframe>, downloads),
// so the server needs to know who is asking: keep a short-lived cookie with the current
// sign-in, scoped to that one path. It is refreshed whenever Supabase refreshes the session.
function syncFileCookie(session) {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    if (session?.access_token) {
      const ttl = Math.max(60, (session.expires_at || 0) - Math.floor(Date.now() / 1000));
      document.cookie = `gbh_at=${encodeURIComponent(session.access_token)}; Path=/api/file; Max-Age=${ttl}; SameSite=Lax${secure}`;
    } else {
      document.cookie = `gbh_at=; Path=/api/file; Max-Age=0; SameSite=Lax${secure}`;
    }
  } catch { /* no cookies (private mode): file links ask to sign in */ }
}
if (typeof window !== 'undefined') {
  supabase.auth.getSession().then(({ data }) => syncFileCookie(data.session)).catch(() => {});
  supabase.auth.onAuthStateChange((_event, session) => syncFileCookie(session));
}

async function currentEmail() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email?.toLowerCase() || null;
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

// Calls a server route. Returns { data } like the Base44/axios client did.
async function callApi(path, body, { formData } = {}) {
  const token = await accessToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      ...(formData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData || JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
    err.status = res.status;
    err.response = { status: res.status, data };
    err.data = data;
    throw err;
  }
  return { data, status: res.status };
}

const entities = makeEntities(() => supabase, { getEmail: currentEmail });

// Deleting a user also removes their login, which needs the server.
const userEntity = entities.User;
const UserEntity = new Proxy(userEntity, {
  get(target, prop) {
    if (prop === 'delete') return async (id) => (await callApi('/api/fn/adminDeleteUser', { user_id: id })).data;
    return target[prop];
  },
});
const entitiesWithUser = new Proxy(entities, {
  get(target, prop) { return prop === 'User' ? UserEntity : target[prop]; },
});

const auth = {
  async me() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const e = new Error('Not authenticated');
      e.status = 401;
      throw e;
    }
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    return { ...fromRow(profile || {}), id: user.id, email: user.email };
  },
  async isAuthenticated() {
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  },
  async updateMe(data) {
    const me = await auth.me();
    return entities.User.update(me.id, data);
  },
  async logout(redirectUrl) {
    await supabase.auth.signOut();
    window.location.href = redirectUrl || '/login';
  },
  redirectToLogin(nextUrl) {
    const next = encodeURIComponent(nextUrl || window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
  },
};

// Base44 "Core" integrations, now backed by Supabase Storage, Resend and Claude.
const Core = {
  /**
   * Uploads a file. With a `scope`, the file is private to that record and only people who
   * can see the record can open it:
   *   { kind: 'tx', id }        a deal's documents
   *   { kind: 'offer', id }     an offer
   *   { kind: 'user', id }      a person's onboarding / own drafts
   *   { kind: 'dm', emails }    a direct message (both emails)
   *   { kind: 'group', id }     a group or deal chat
   *   { kind: 'channel', name } a channel (and its threads)
   *   { kind: 'misc' }          anyone in the brokerage
   * Without a scope the file is public (headshots, logos, marketing images).
   */
  async UploadFile({ file, scope }) {
    if (scope) {
      const { data } = await callApi('/api/fn/fileUpload', { scope, name: file.name || 'file', type: file.type || '', size: file.size || 0 });
      const { error } = await supabase.storage.from('private-files').uploadToSignedUrl(data.path, data.token, file, { contentType: file.type || undefined });
      if (error) throw new Error(error.message);
      return { file_url: data.file_url, private: true };
    }
    const path = `${Date.now()}-${crypto.randomUUID()}-${safeName(file.name || 'file')}`;
    const { error } = await supabase.storage.from('public-files').upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('public-files').getPublicUrl(path);
    return { file_url: data.publicUrl };
  },
  async UploadPrivateFile({ file }) {
    const fd = new FormData();
    fd.append('file', file, file.name || 'file');
    return (await callApi('/api/fn/uploadPrivateFile', null, { formData: fd })).data;
  },
  async CreateFileSignedUrl(params) {
    return (await callApi('/api/fn/createFileSignedUrl', params)).data;
  },
  async SendEmail(params) {
    return (await callApi('/api/fn/sendEmail', params)).data;
  },
  async InvokeLLM(params) {
    return (await callApi('/api/fn/invokeLLM', params)).data.result;
  },
};

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80);
}

export const base44 = {
  entities: entitiesWithUser,
  auth,
  integrations: { Core },
  functions: {
    invoke: (name, payload) => callApi(`/api/fn/${encodeURIComponent(name)}`, payload),
  },
  users: {
    inviteUser: async (email, role) => (await callApi('/api/fn/inviteUser', { email, role })).data,
  },
};

export default base44;
