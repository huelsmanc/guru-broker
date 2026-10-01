// Tamper-evident seal for signed PDFs.
//
// After a document is fully signed, the final PDF gets a digital signature (PKCS#7 /
// "adbe.pkcs7.detached", the same kind Adobe Reader checks). Any change to the file after
// that breaks the seal, and Adobe shows "the document has been modified".
//
// The seal certificate is made by the app itself the first time it's needed and kept in
// the database (app_secret "esign_seal"). It's self-issued, so Adobe reports the signer's
// identity as "unknown" unless you trust it, but the integrity check works everywhere. A
// certificate from a trusted provider can replace it later (ESIGN_SEAL_P12 + password).

import forge from 'node-forge';
import { PDFDocument, PDFName, PDFNumber, PDFHexString, PDFString, PDFArray } from 'pdf-lib';

const SIG_BYTES = 8192; // room for the signature (hex doubles it)
const PLACEHOLDER = 9999999999;

let cached = null;

/** The seal's private key and certificate (PEM). Creates and stores them once. */
export async function sealKeys() {
  if (cached) return cached;
  if (process.env.ESIGN_SEAL_KEY && process.env.ESIGN_SEAL_CERT) {
    cached = { keyPem: process.env.ESIGN_SEAL_KEY.replace(/\\n/g, '\n'), certPem: process.env.ESIGN_SEAL_CERT.replace(/\\n/g, '\n') };
    return cached;
  }
  const { adminClient } = await import('./base44.js');
  const db = adminClient();
  const read = async () => (await db.from('app_secret').select('value').eq('name', 'esign_seal').maybeSingle()).data?.value;
  let value = await read();
  if (!value) {
    const made = makeSealCertificate();
    const { error } = await db.from('app_secret').insert({ name: 'esign_seal', value: made });
    value = error ? (await read()) || made : made; // another request may have made one first
  }
  cached = value;
  return cached;
}

export function makeSealCertificate(commonName = 'Guru Broker E-Sign Seal') {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = `01${forge.util.bytesToHex(forge.random.getBytesSync(15))}`;
  cert.validity.notBefore = new Date(Date.now() - 864e5);
  cert.validity.notAfter = new Date(Date.now() + 20 * 365 * 864e5);
  const attrs = [{ name: 'commonName', value: commonName }, { name: 'organizationName', value: 'Guru Broker' }, { name: 'countryName', value: 'US' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
    { name: 'extKeyUsage', emailProtection: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { keyPem: forge.pki.privateKeyToPem(keys.privateKey), certPem: forge.pki.certificateToPem(cert) };
}

/** Adds an empty signature to the PDF (to be filled by sealPdf). Returns the saved bytes. */
async function withPlaceholder(bytes, { reason, name, location }) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const ctx = pdf.context;
  const page = pdf.getPages()[0];
  const sig = ctx.obj({
    Type: 'Sig',
    Filter: 'Adobe.PPKLite',
    SubFilter: 'adbe.pkcs7.detached',
    ByteRange: [0, PLACEHOLDER, PLACEHOLDER, PLACEHOLDER],
    Contents: PDFHexString.of('0'.repeat(SIG_BYTES * 2)),
    Reason: PDFString.of(reason || 'Signed electronically; sealed to show any later change'),
    M: PDFString.fromDate(new Date()),
    Name: PDFString.of(name || 'Guru Broker E-Sign'),
    Location: PDFString.of(location || 'gurubroker.app'),
  });
  const sigRef = ctx.register(sig);
  const widget = ctx.obj({
    Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: [0, 0, 0, 0], V: sigRef,
    T: PDFString.of(`Seal ${Date.now()}`), F: 4, P: page.ref,
  });
  const widgetRef = ctx.register(widget);
  const annots = page.node.lookup(PDFName.of('Annots'));
  if (annots instanceof PDFArray) annots.push(widgetRef);
  else page.node.set(PDFName.of('Annots'), ctx.obj([widgetRef]));
  const acro = pdf.catalog.lookup(PDFName.of('AcroForm'));
  if (acro) {
    const fields = acro.lookup(PDFName.of('Fields'));
    if (fields instanceof PDFArray) fields.push(widgetRef); else acro.set(PDFName.of('Fields'), ctx.obj([widgetRef]));
    acro.set(PDFName.of('SigFlags'), PDFNumber.of(3));
  } else {
    pdf.catalog.set(PDFName.of('AcroForm'), ctx.register(ctx.obj({ Fields: [widgetRef], SigFlags: 3 })));
  }
  return pdf.save({ useObjectStreams: false });
}

/** Seals a finished PDF. Returns new bytes; any later edit invalidates the seal. */
export async function sealPdf(bytes, opts = {}) {
  const { keyPem, certPem } = opts.keys || (await sealKeys());
  const pdf = Buffer.from(await withPlaceholder(bytes, opts));
  const text = pdf.toString('latin1');

  const brMatch = /\/ByteRange\s*\[\s*0\s+9999999999\s+9999999999\s+9999999999\s*\]/.exec(text);
  if (!brMatch) throw new Error('Seal placeholder not found');
  const hexZeros = `<${'0'.repeat(SIG_BYTES * 2)}>`;
  let contentsStart = text.indexOf(hexZeros, brMatch.index);
  if (contentsStart < 0) contentsStart = text.lastIndexOf(hexZeros, brMatch.index);
  if (contentsStart < 0) throw new Error('Seal contents not found');
  const contentsEnd = contentsStart + hexZeros.length;
  const range = [0, contentsStart, contentsEnd, pdf.length - contentsEnd];
  let br = `/ByteRange [${range.join(' ')}]`;
  if (br.length > brMatch[0].length) throw new Error('Seal byte range too long');
  br = br.padEnd(brMatch[0].length, ' ');
  pdf.write(br, brMatch.index, 'latin1');

  const signed = Buffer.concat([pdf.subarray(0, contentsStart), pdf.subarray(contentsEnd)]);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(signed.toString('binary'));
  const cert = forge.pki.certificateFromPem(certPem);
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyPem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const hex = Buffer.from(der, 'binary').toString('hex');
  if (hex.length > SIG_BYTES * 2) throw new Error('Seal signature too large');
  pdf.write(`<${hex.padEnd(SIG_BYTES * 2, '0')}>`, contentsStart, 'latin1');
  return new Uint8Array(pdf);
}
