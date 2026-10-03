// What signers type into e-sign boxes (a W-9's tax number, an address...) is stored encrypted,
// so a database export or a stray query never shows it. Only the server opens it, to build the
// signed PDF and to show the signed document to people allowed to see it.
import crypto from 'node:crypto';

const PREFIX = 'enc1:';
function key() {
  const base = process.env.SECRETS_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base) throw new Error('Server secrets are not set up.');
  return Buffer.from(crypto.hkdfSync('sha256', base, 'guru-broker', 'esign-field-values', 32));
}

/** Typed answers get sealed; signatures, ticks and file links stay as they are. */
export const SEALED_TYPES = new Set(['text', 'dropdown']);

export function sealValue(v) {
  if (typeof v !== 'string' || !v || v.startsWith(PREFIX)) return v;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(v, 'utf8'), c.final()]);
  return PREFIX + [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function openValue(v) {
  if (typeof v !== 'string' || !v.startsWith(PREFIX)) return v; // older rows are plain
  try {
    const [iv, tag, enc] = v.slice(PREFIX.length).split('.').map((s) => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return ''; }
}

/** Signature data rows with their typed answers opened (server only). */
export const openSignatureData = (rows) => (rows || []).map((r) => ({ ...r, fields: (r.fields || []).map((f) => ({ ...f, value: openValue(f.value) })) }));
