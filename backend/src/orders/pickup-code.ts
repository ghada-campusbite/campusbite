import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// The 4-digit pickup code must be shown to the student again later, so it can't
// be stored as a one-way hash. It is encrypted at rest (AES-256-GCM) instead:
// a database dump alone doesn't reveal codes. The key is derived from
// PICKUP_CODE_SECRET, falling back to JWT_ACCESS_SECRET in dev/test.
const key = () =>
  scryptSync(process.env.PICKUP_CODE_SECRET || process.env.JWT_ACCESS_SECRET || 'dev-only', 'campusbite-pickup-code-v1', 32);

export function encryptPickupCode(code: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(code, 'utf8'), c.final()]);
  return `${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}

export function decryptPickupCode(enc: string): string {
  const [iv, tag, ct] = enc.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
