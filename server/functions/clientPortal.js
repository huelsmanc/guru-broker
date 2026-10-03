// New: the client portal. Two kinds of callers:
//  Clients (no account), with their link token `t` or a session from a confirmed device:
//    open {t, session?}      -> { session } if this device is confirmed, else { needs_code, email_hint }
//    send_code {t}           -> emails a 6-digit code
//    verify {t, code}        -> { session }
//    load {session}          -> the deal, team, messages, document requests, uploads
//    messages {session, after} -> messages newer than `after`
//    send {session, text}    -> posts in the deal's client chat
//    upload_url {session, name, size, type} -> one-time upload link (the file goes straight to storage)
//    upload_done {session, path, name, request_id?} -> files it under the deal's Client uploads
//  The deal team (signed in, and able to see the deal):
//    team {transaction_id}   -> clients with their portal status and links, requests, client chat
//    invite {transaction_id, contact_id, email?} | new_link {...} | disable {...}
//    request {transaction_id, title, note} | cancel_request {transaction_id, request_id}
import { doneFields } from '../../shared/dealTimeline.js';
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { isAdminRole, can, notifyPeople } from '../lib/team.js';
import { reviewsAllDeals } from '../../shared/access.js';
import { scopeFolder, safeName, fileUrl, PRIVATE_BUCKET } from '../lib/files.js';
import {
  signSession, readSession, randomToken, hashCode, maskEmail, isClientContact, ensureClientChat,
  brandFor, portalLink, clientEmail, esc,
} from '../lib/clientPortal.js';
import { dealAppend } from '../../shared/dealAppend.js';

const lc = (e) => String(e || '').toLowerCase().trim();
const MAX_FILE = 25 * 1024 * 1024;
const OK_FILE = /\.(pdf|png|jpe?g|heic|heif|webp|gif|docx?|xlsx?|txt|csv)$/i;
const DATES = [['inspection_contingency_date', 'Inspection deadline'], ['appraisal_date', 'Appraisal'], ['financing_contingency_date', 'Financing deadline'],
  ['loan_approval_date', 'Loan approval'], ['title_deadline_date', 'Title commitment'], ['closing_date', 'Closing']];
class Problem extends Error { constructor(m, s = 400) { super(m); this.status = s; } }

async function contactByToken(E, t) {
  if (!t || String(t).length < 20) throw new Problem('This link is not valid. Ask your agent for a new one.', 404);
  const [c] = await E.TransactionContact.filter({ portal_token: String(t) }, '-created_date', 1);
  if (!c || !isClientContact(c)) throw new Problem('This link is no longer active. Ask your agent for a new one.', 404);
  return c;
}

async function fromSession(E, token) {
  const s = await readSession(token);
  if (!s) throw new Problem('Please open your link again to sign in.', 401);
  const [c] = await E.TransactionContact.filter({ id: s.c }, '-created_date', 1);
  if (!c || !isClientContact(c) || !c.portal_token || Number(c.portal_v || 0) !== Number(s.v)) throw new Problem('Your access changed. Open the newest link from your agent.', 401);
  const tx = await E.Transaction.get(s.t).catch(() => null);
  if (!tx || tx.id !== c.transaction_id) throw new Problem('This deal is no longer available.', 404);
  return { c, tx };
}

const seen = (E, c) => (Date.now() - new Date(c.portal_last_seen || 0) > 60_000 ? E.TransactionContact.update(c.id, { portal_last_seen: new Date().toISOString() }).catch(() => {}) : null);

async function chatMessages(E, groupId, after) {
  let q = adminClient().from('group_message').select('id, sender_email, sender_name, sender_photo, content, created_date').eq('group_id', groupId);
  if (after) q = q.gt('created_date', after);
  const { data } = await q.order('created_date', { ascending: false }).limit(150);
  return (data || []).reverse();
}

const shape = (m, me, photos) => ({ id: m.id, mine: lc(m.sender_email) === lc(me), name: m.sender_name || m.sender_email, photo: photos.get(lc(m.sender_email)) || m.sender_photo || null, content: m.content, at: m.created_date });

async function teamOf(E, tx) {
  const emails = [...new Set([tx.agent_email, tx.tc_email, ...(tx.co_agents || []).map((a) => a?.email)].map(lc).filter(Boolean))];
  const users = emails.length ? await E.User.filter({ brokerage_id: tx.brokerage_id }, 'full_name', 5000) : [];
  return emails.map((e) => users.find((u) => lc(u.email) === e)).filter(Boolean).map((u) => ({
    name: u.display_name || u.full_name || u.email, email: lc(u.email), phone: u.phone || null, photo: u.headshot || null,
    role: lc(u.email) === lc(tx.agent_email) ? 'Your agent' : lc(u.email) === lc(tx.tc_email) ? 'Transaction coordinator' : 'Agent',
  }));
}

async function progressOf(E, tx) {
  const lists = await E.Checklist.filter({ subject_type: 'transaction', subject_id: tx.id }, 'created_date', 20).catch(() => []);
  const items = lists.flatMap((l) => l.items || []).filter((i) => i.required !== false);
  if (!items.length) return null;
  return { done: items.filter((i) => ['approved', 'exempt', 'done'].includes(i.status)).length, total: items.length };
}

async function clientAction(E, action, body) {
  if (action === 'open') {
    const c = await contactByToken(E, body.t);
    if (body.session) {
      const s = await readSession(body.session);
      if (s && s.c === c.id && Number(s.v) === Number(c.portal_v || 0)) return { session: body.session };
    }
    return { needs_code: true, email_hint: maskEmail(c.email), name: String(c.name || '').split(' ')[0] };
  }
  if (action === 'send_code') {
    const c = await contactByToken(E, body.t);
    const recent = (c.portal_code?.sends || []).filter((t) => Date.now() - t < 3600_000);
    if (recent.length >= 5) throw new Problem('Too many codes sent. Try again in an hour.', 429);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const salt = randomToken();
    await E.TransactionContact.update(c.id, { portal_code: { hash: hashCode(code, salt), salt, exp: Date.now() + 15 * 60_000, tries: 0, sends: [...recent, Date.now()] } });
    const tx = await E.Transaction.get(c.transaction_id).catch(() => null);
    const brand = tx ? await brandFor(E, tx.brokerage_id) : null;
    const { SendEmail } = await import('../lib/integrations.js');
    await SendEmail({
      to: c.email, subject: `Your code: ${code}`, from_name: brand?.name || 'Client portal',
      body: `<div style="font-family:Arial,sans-serif;max-width:480px;line-height:1.55;color:#1f2937"><p>Your code to open your client portal${tx ? ` for ${esc(tx.property_address)}` : ''}:</p><p style="font-size:30px;font-weight:bold;letter-spacing:6px">${code}</p><p style="font-size:12px;color:#6b7280">It works for 15 minutes. If you didn't ask for it, you can ignore this email.</p></div>`,
    });
    return { sent: true, email_hint: maskEmail(c.email) };
  }
  if (action === 'verify') {
    const c = await contactByToken(E, body.t);
    const pc = c.portal_code;
    if (!pc?.hash || pc.exp < Date.now()) throw new Problem('That code expired. Send a new one.');
    if ((pc.tries || 0) >= 5) throw new Problem('Too many tries. Send a new code.');
    if (hashCode(String(body.code || '').replace(/\D/g, ''), pc.salt) !== pc.hash) {
      await E.TransactionContact.update(c.id, { portal_code: { ...pc, tries: (pc.tries || 0) + 1 } });
      throw new Problem("That code isn't right. Check the newest email.");
    }
    await E.TransactionContact.update(c.id, { portal_code: null, portal_last_seen: new Date().toISOString() });
    return { session: await signSession({ contactId: c.id, txId: c.transaction_id, v: Number(c.portal_v || 0) }) };
  }

  const { c, tx } = await fromSession(E, body.session);
  if (action === 'load') {
    seen(E, c);
    const [team, brand, progress, group] = await Promise.all([teamOf(E, tx), brandFor(E, tx.brokerage_id), progressOf(E, tx), ensureClientChat(E, tx)]);
    const photos = new Map(team.map((p) => [p.email, p.photo]));
    const opts = { dates: true, checklist: true, agent: true, ...(tx.share_options || {}) };
    const done = doneFields(tx);
    return {
      me: { name: c.name, email: lc(c.email), role: c.role },
      brand,
      deal: {
        property: tx.property_address, status: tx.status, side: tx.deal_type || null,
        dates: opts.dates ? DATES.filter(([k]) => tx[k]).map(([k, label]) => ({ label, date: tx[k], done: done.has(k) })) : [],
        progress: opts.checklist ? progress : null,
      },
      team: opts.agent ? team : team.map(({ name, role, photo }) => ({ name, role, photo })),
      messages: (await chatMessages(E, group.id)).map((m) => shape(m, c.email, photos)),
      requests: (tx.client_requests || []).filter((r) => r.status !== 'cancelled').map((r) => ({ id: r.id, title: r.title, note: r.note || '', status: r.status, at: r.at, by: r.requested_by_name, file_name: r.file_name || null })),
      uploads: (tx.documents || []).filter((d) => d.source === 'client').map((d) => ({ name: d.name, at: d.uploaded_at, by: d.uploaded_by })),
    };
  }
  if (action === 'messages') {
    seen(E, c);
    const group = await ensureClientChat(E, tx);
    const team = await teamOf(E, tx);
    const photos = new Map(team.map((p) => [p.email, p.photo]));
    return { messages: (await chatMessages(E, group.id, body.after ? String(body.after) : null)).map((m) => shape(m, c.email, photos)) };
  }
  if (action === 'send') {
    const text = String(body.text || '').trim().slice(0, 4000);
    if (!text) throw new Problem('Write a message first.');
    const group = await ensureClientChat(E, tx);
    const { data, error } = await adminClient().from('group_message').insert({
      group_id: group.id, brokerage_id: tx.brokerage_id, sender_email: lc(c.email), sender_name: c.name || c.email, content: text, mentions: [], reactions: [], created_by: lc(c.email),
    }).select('id, sender_email, sender_name, sender_photo, content, created_date').single();
    if (error) throw new Problem(error.message, 500);
    seen(E, c);
    return { message: shape(data, c.email, new Map()) };
  }
  if (action === 'upload_url') {
    const name = String(body.name || 'file');
    if (!OK_FILE.test(name)) throw new Problem('Upload a PDF, photo, or Word/Excel file.');
    if (Number(body.size || 0) > MAX_FILE) throw new Problem('Files can be up to 25 MB.');
    const folder = scopeFolder(tx.brokerage_id, { kind: 'tx', id: tx.id });
    const path = `${folder}/client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${safeName(name)}`;
    const { data, error } = await adminClient().storage.from(PRIVATE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Problem(error?.message || 'Could not start the upload', 500);
    return { path, token: data.token };
  }
  if (action === 'upload_done') {
    const folder = scopeFolder(tx.brokerage_id, { kind: 'tx', id: tx.id });
    const path = String(body.path || '');
    const file = path.slice(folder.length + 1);
    if (!path.startsWith(`${folder}/client-`) || file.includes('/')) throw new Problem('That upload is not for this deal.', 403);
    const { data: listed } = await adminClient().storage.from(PRIVATE_BUCKET).list(folder, { search: file });
    if (!(listed || []).some((o) => o.name === file)) throw new Problem("The file didn't finish uploading. Try again.");
    const fresh = await E.Transaction.get(tx.id);
    const name = String(body.name || file).slice(0, 160);
    const reqId = body.request_id ? String(body.request_id) : null;
    const requests = (fresh.client_requests || []).map((r) => (r.id === reqId && r.status !== 'cancelled' ? { ...r, status: 'received', file_name: name, received_at: new Date().toISOString(), received_from: c.name || c.email } : r));
    const doc = { name, url: fileUrl(path), uploaded_at: new Date().toISOString(), uploaded_by: c.name || c.email, source: 'client', client_email: lc(c.email), request_id: reqId };
    await E.Transaction.update(tx.id, { client_requests: requests });
    await dealAppend(adminClient(), tx.id, 'documents', doc);
    const req = requests.find((r) => r.id === reqId);
    const team = [...new Set([fresh.agent_email, fresh.tc_email].map(lc).filter(Boolean))].map((email) => ({ email }));
    await notifyPeople(E, {
      brokerageId: tx.brokerage_id, people: team, title: `${c.name || 'Your client'} uploaded a document`,
      message: `${c.name || 'Your client'} uploaded "${name}"${req ? ` for "${req.title}"` : ''} on ${fresh.property_address}.`,
      link: `/Transactions/${tx.id}?tab=documents`, referenceId: tx.id, referenceType: 'Transaction', pushKind: 'deal',
    }).catch(() => {});
    return { ok: true };
  }
  throw new Problem('Unknown action');
}

async function teamAction(base44, action, body) {
  const me = await base44.auth.me();
  // Seeing the deal (security rules) is what lets someone manage its clients.
  const tx = await base44.entities.Transaction.get(String(body.transaction_id || '')).catch(() => null);
  if (!tx) throw new Problem('Deal not found', 404);
  const onDeal = [tx.agent_email, tx.tc_email, ...(tx.co_agents || []).map((a) => a?.email)].map(lc).includes(lc(me.email));
  if (!onDeal && !isAdminRole(me.role) && !reviewsAllDeals(me) && me.role !== 'super_admin') throw new Problem('Only the people on this deal can manage its clients.', 403);
  const E = base44.asServiceRole.entities;
  const contacts = (await E.TransactionContact.filter({ transaction_id: tx.id }, 'created_date', 200)).filter(isClientContact);
  const brand = await brandFor(E, tx.brokerage_id);
  const agentName = me.display_name || me.full_name || me.email;
  const invite = async (c, { email, fresh, why } = {}) => {
    let token = c.portal_token;
    let v = Number(c.portal_v || 0);
    if (!token || fresh) { token = randomToken(); v += 1; await E.TransactionContact.update(c.id, { portal_token: token, portal_v: v, portal_invited_at: new Date().toISOString() }); }
    if (email) {
      await clientEmail({ to: c.email, name: c.name, token, brand, agentName, replyTo: me.email,
        subject: why ? `${why.subject}` : `Your client portal for ${tx.property_address}`,
        lines: why ? why.lines : [`I've set up a private page where you can follow ${esc(tx.property_address)}: key dates, progress, messages with our team, and anything we need from you.`] });
    }
    return token;
  };

  if (action === 'team') {
    const group = await ensureClientChat(E, tx, { add: onDeal ? null : me.email });
    return {
      group,
      clients: contacts.map((c) => ({ id: c.id, name: c.name, email: lc(c.email), role: c.role, active: !!c.portal_token, link: c.portal_token ? portalLink(c.portal_token) : null, last_seen: c.portal_last_seen || null, invited_at: c.portal_invited_at || null })),
      requests: (tx.client_requests || []).filter((r) => r.status !== 'cancelled'),
    };
  }
  if (['invite', 'new_link', 'disable'].includes(action)) {
    const c = contacts.find((x) => x.id === body.contact_id);
    if (!c) throw new Problem('Add this person as a client with an email first (Users & contacts).', 404);
    if (action === 'disable') { await E.TransactionContact.update(c.id, { portal_token: null, portal_v: Number(c.portal_v || 0) + 1 }); return { ok: true }; }
    const token = await invite(c, { email: body.email !== false, fresh: action === 'new_link' });
    await ensureClientChat(E, tx);
    return { link: portalLink(token) };
  }
  if (action === 'request') {
    const title = String(body.title || '').trim().slice(0, 120);
    if (!title) throw new Problem('What do you need from the client?');
    if (!contacts.length) throw new Problem('Add the buyer or seller as a client with an email first (Users & contacts).');
    const r = { id: randomToken().slice(0, 12), title, note: String(body.note || '').trim().slice(0, 600), status: 'open', at: new Date().toISOString(), requested_by: lc(me.email), requested_by_name: agentName };
    const fresh = await E.Transaction.get(tx.id);
    await E.Transaction.update(tx.id, { client_requests: [...(fresh.client_requests || []), r] });
    let emailed = 0;
    for (const c of contacts) {
      await invite(c, { email: true, why: { subject: `Document needed: ${title}`, lines: [`We need something from you for ${esc(tx.property_address)}:`, `<b>${esc(title)}</b>${r.note ? `<br>${esc(r.note)}` : ''}`, 'You can upload it from your phone or computer in your client portal.'] } }).then(() => { emailed += 1; }).catch((e) => console.error('request email', e.message));
    }
    return { request: r, emailed };
  }
  if (action === 'cancel_request') {
    const fresh = await E.Transaction.get(tx.id);
    await E.Transaction.update(tx.id, { client_requests: (fresh.client_requests || []).map((r) => (r.id === body.request_id ? { ...r, status: 'cancelled' } : r)) });
    return { ok: true };
  }
  throw new Problem('Unknown action');
}

const CLIENT_ACTIONS = new Set(['open', 'send_code', 'verify', 'load', 'messages', 'send', 'upload_url', 'upload_done']);

export default async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const base44 = createClientFromRequest(req);
    const out = CLIENT_ACTIONS.has(body.action) ? await clientAction(base44.asServiceRole.entities, body.action, body) : await teamAction(base44, body.action, body);
    return Response.json(out);
  } catch (error) {
    if (!(error instanceof Problem)) console.error('clientPortal:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
