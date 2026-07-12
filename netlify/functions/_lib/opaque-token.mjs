import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';
import { signingSecrets } from './config.mjs';

function purposeKey(secret, purpose, use) {
  return createHmac('sha256', secret)
    .update('prolinker:' + purpose + ':' + use + ':v1')
    .digest();
}

function equalSignature(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(unsigned, secret, purpose) {
  return createHmac('sha256', purposeKey(secret, purpose, 'signing'))
    .update(unsigned)
    .digest('base64url');
}

export function sealOpaqueToken(payload, purpose) {
  const secret = signingSecrets()[0];
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', purposeKey(secret, purpose, 'encryption'), iv);
  const additionalData = Buffer.from('prolinker:' + purpose + ':v1', 'utf8');
  cipher.setAAD(additionalData);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), 'utf8')),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  const unsigned = [
    'v1',
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    tag.toString('base64url')
  ].join('.');
  return unsigned + '.' + signature(unsigned, secret, purpose);
}

function decryptWithSecret(parts, secret, purpose) {
  const unsigned = parts.slice(0, 4).join('.');
  if (!equalSignature(signature(unsigned, secret, purpose), parts[4])) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const encrypted = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || encrypted.length > 4096) return null;
    const decipher = createDecipheriv('aes-256-gcm', purposeKey(secret, purpose, 'encryption'), iv);
    decipher.setAAD(Buffer.from('prolinker:' + purpose + ':v1', 'utf8'));
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    const payload = JSON.parse(decrypted.toString('utf8'));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch (error) {
    return null;
  }
}

export function openOpaqueToken(token, purpose, expectedType) {
  const raw = String(token || '');
  if (!raw || raw.length > 7000) throw new Error('INVALID_OPAQUE_TOKEN');
  const parts = raw.split('.');
  if (parts.length !== 5 || parts[0] !== 'v1') throw new Error('INVALID_OPAQUE_TOKEN');
  let payload = null;
  for (const secret of signingSecrets()) {
    payload = decryptWithSecret(parts, secret, purpose);
    if (payload) break;
  }
  if (!payload) throw new Error('INVALID_OPAQUE_TOKEN');
  if (expectedType && payload.typ !== expectedType) throw new Error('INVALID_OPAQUE_TOKEN_TYPE');
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= now) throw new Error('OPAQUE_TOKEN_EXPIRED');
  if (!Number.isFinite(payload.iat) || payload.iat > now + 60) throw new Error('INVALID_OPAQUE_TOKEN_TIME');
  return payload;
}

