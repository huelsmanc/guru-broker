// Drop-in replacement for the Base44 SDK client.
// Pages keep importing `base44` from here; underneath it now talks to your own
// Supabase project and your own /api routes on Vercel.

import { createClient } from '@supabase/supabase-js';
import { makeEntities, fromRow } from '../../shared/entities.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. See SETUP.md.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

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
  async UploadFile({ file }) {
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
