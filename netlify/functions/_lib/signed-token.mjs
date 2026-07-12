import { createHmac, timingSafeEqual } from 'node:crypto';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signatureFor(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function equalText(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function randomSafeEqual(left, right) {
  return equalText(left, right);
}

export function signToken(payload, secret) {
  const encoded = base64url(JSON.stringify(payload));
  return encoded + '.' + signatureFor(encoded, secret);
}

export function verifyToken(token, secrets, expectedType) {
  const raw = String(token || '');
  if (!raw || raw.length > 12000) throw new Error('INVALID_TOKEN');
  const parts = raw.split('.');
  if (parts.length !== 2) throw new Error('INVALID_TOKEN');
  const [encoded, receivedSignature] = parts;
  const valid = secrets.some((secret) => equalText(signatureFor(encoded, secret), receivedSignature));
  if (!valid) throw new Error('INVALID_TOKEN_SIGNATURE');
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch (error) { throw new Error('INVALID_TOKEN_PAYLOAD'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('INVALID_TOKEN_PAYLOAD');
  if (expectedType && payload.typ !== expectedType) throw new Error('INVALID_TOKEN_TYPE');
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload.exp) || payload.exp <= now) throw new Error('TOKEN_EXPIRED');
  if (Number.isFinite(payload.iat) && payload.iat > now + 60) throw new Error('INVALID_TOKEN_TIME');
  return payload;
}

