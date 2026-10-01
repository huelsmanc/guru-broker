// New: 2-step sign-in. People who must confirm a second step (brokers, admins, accounting, anyone
// who turns it on, or everyone when the brokerage requires it) use an authenticator app (Supabase
// MFA, done in the browser) or a 6-digit code emailed to them (done here).
//   status { device? }        -> { needed, ok, email }. A trusted-device token confirms this sign-in.
//   email_send                -> emails a code (at most once a minute; works 10 minutes)
//   email_verify { code, remember } -> confirms this sign-in; remember -> { device_token } for 30 days
//   totp_done { remember }    -> after the authenticator code (sign-in is now aal2); remember -> { device_token }
//   devices                   -> this person's trusted devices
//   forget_device { id } / forget_devices
//   set_mine { enabled }      -> turn 2-step on or off for yourself (needs a confirmed sign-in)
//   reset_user { user_id }    -> admin: remove someone's authenticator and trusted devices (lost phone)
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { SendEmail } from '../lib/integrations.js';
import { isAdminRole, can } from '../lib/team.js';
import { tokenClaims, secondStepNeeded, sessionConfirmed, confirmSession, trustDevice, findDevice, sha256, DEVICE_DAYS } from '../lib/twostep.js';

const CODE_MINUTES = 10;
const bearer = (req) => { const h = req.headers.get('authorization') || ''; return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : ''; };
const maskEmail = (e) => String(e || '').replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '•'.repeat(Math.min(6, Math.max(1, b.length))) + c);
const codeHash = (userId, code) => sha256(`2step:${userId}:${code}`);
const deviceLabel = (req) => {
  const ua = req.headers.get('user-agent') || '';
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
};

export default async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me({ secondStep: false });
    const admin = adminClient();
    const claims = tokenClaims(bearer(req)) || {};
    const { data: row } = await admin.from('profiles').select('*').eq('id', me.id).maybeSingle();
    const needed = await secondStepNeeded(admin, row);
    let ok = !needed || (await sessionConfirmed(admin, me.id, claims));
    const requireOk = () => { if (!ok) throw Object.assign(new Error('Confirm the second sign-in step first.'), { status: 401, code: 'second_step_required' }); };

    if (action === 'status') {
      let via;
      if (!ok && body.device) {
        const dev = await findDevice(admin, me.id, body.device);
        if (dev) {
          await confirmSession(admin, me.id, claims, 'device');
          await admin.from('trusted_device').update({ last_used_at: new Date().toISOString() }).eq('id', dev.id);
          ok = true; via = 'device';
        }
      }
      return Response.json({ needed, ok, via, aal: claims.aal || 'aal1', email: maskEmail(me.email), mine: !!(row?.extra?.mfa_enabled) });
    }

    if (action === 'email_send') {
      const { data: prev } = await admin.from('second_step_code').select('*').eq('user_id', me.id);
      const last = prev?.[0];
      if (last && Date.now() - new Date(last.sent_at).getTime() < 60_000) return Response.json({ status: 'sent', email: maskEmail(me.email) });
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');
      await admin.from('second_step_code').delete().eq('user_id', me.id);
      await admin.from('second_step_code').insert({ user_id: me.id, code_hash: codeHash(me.id, code), sent_at: new Date().toISOString(), attempts: 0 });
      await SendEmail({
        to: me.email,
        subject: `Your Guru Broker sign-in code: ${code}`,
        from_name: 'Guru Broker',
        body: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937"><p>Your code to finish signing in is:</p><p style="font-size:30px;letter-spacing:6px;font-weight:bold">${code}</p><p style="color:#6b7280;font-size:13px">It works for ${CODE_MINUTES} minutes. If you didn't just sign in, change your password: someone else may know it.</p></div>`,
      });
      return Response.json({ status: 'sent', email: maskEmail(me.email) });
    }

    if (action === 'email_verify') {
      const { data: prev } = await admin.from('second_step_code').select('*').eq('user_id', me.id);
      const rec = prev?.[0];
      if (!rec || Date.now() - new Date(rec.sent_at).getTime() > CODE_MINUTES * 60_000) return Response.json({ error: 'That code has expired. Send a new one.' }, { status: 400 });
      if ((rec.attempts || 0) >= 5) return Response.json({ error: 'Too many tries. Send a new code.' }, { status: 429 });
      const good = codeHash(me.id, String(body.code || '').replace(/\D/g, '')) === rec.code_hash;
      if (!good) {
        await admin.from('second_step_code').update({ attempts: (rec.attempts || 0) + 1 }).eq('user_id', me.id);
        return Response.json({ error: "That code isn't right. Check the latest email." }, { status: 400 });
      }
      await admin.from('second_step_code').delete().eq('user_id', me.id);
      await confirmSession(admin, me.id, claims, 'email');
      const device_token = body.remember ? await trustDevice(admin, me.id, deviceLabel(req)) : undefined;
      return Response.json({ ok: true, device_token });
    }

    if (action === 'totp_done') {
      if (claims.aal !== 'aal2') return Response.json({ error: 'Enter the code from your authenticator app first.' }, { status: 400 });
      // Also record this sign-in, so it stays confirmed if the app is later removed from the account.
      await confirmSession(admin, me.id, claims, 'totp');
      const device_token = body.remember ? await trustDevice(admin, me.id, deviceLabel(req)) : undefined;
      return Response.json({ ok: true, device_token });
    }

    if (action === 'devices') {
      requireOk();
      const { data } = await admin.from('trusted_device').select('id, label, created_at, last_used_at, expires_at').eq('user_id', me.id).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false });
      return Response.json({ devices: data || [], days: DEVICE_DAYS });
    }
    if (action === 'forget_device') {
      requireOk();
      await admin.from('trusted_device').delete().eq('user_id', me.id).eq('id', String(body.id || ''));
      return Response.json({ ok: true });
    }
    if (action === 'forget_devices') {
      requireOk();
      await admin.from('trusted_device').delete().eq('user_id', me.id);
      return Response.json({ ok: true });
    }

    if (action === 'set_mine') {
      requireOk();
      const enabled = !!body.enabled;
      const extra = { ...(row?.extra || {}), mfa_enabled: enabled };
      await admin.from('profiles').update({ extra }).eq('id', me.id);
      // Turning it on: this sign-in counts as confirmed (they're already in), so they aren't locked out mid-page.
      if (enabled && !(await sessionConfirmed(admin, me.id, claims))) await confirmSession(admin, me.id, claims, 'opt_in');
      return Response.json({ ok: true, mine: enabled });
    }

    if (action === 'reset_user') {
      requireOk();
      const { data: target } = await admin.from('profiles').select('id, brokerage_id, role').eq('id', String(body.user_id || '')).maybeSingle();
      if (!target) return Response.json({ error: 'User not found' }, { status: 404 });
      const allowed = me.role === 'super_admin'
        || ((isAdminRole(me.role) || can(me, 'users.manage')) && target.brokerage_id === me.brokerage_id && target.role !== 'super_admin');
      if (!allowed) return Response.json({ error: 'Not allowed' }, { status: 403 });
      let removed = 0;
      const mfa = admin.auth.admin.mfa;
      if (mfa?.listFactors) {
        const { data } = await mfa.listFactors({ userId: target.id });
        for (const f of data?.factors || []) {
          const { error } = await mfa.deleteFactor({ id: f.id, userId: target.id });
          if (error) throw new Error(error.message);
          removed++;
        }
      }
      await admin.from('trusted_device').delete().eq('user_id', target.id);
      await admin.from('second_step_session').delete().eq('user_id', target.id);
      await admin.from('second_step_code').delete().eq('user_id', target.id);
      return Response.json({ ok: true, removed_factors: removed });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    if (error.status !== 401) console.error('twoStep:', error);
    return Response.json({ error: error.message || 'Could not do that. Please try again.', ...(error.code ? { code: error.code } : {}) }, { status: error.status || 500 });
  }
};
