import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import {
  linkedinClientId,
  linkedinClientSecret,
  linkedinRedirectUri,
  requireNonce
} from './config.mjs';

const AUTHORIZATION_ENDPOINT = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_ENDPOINT = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_ENDPOINT = 'https://api.linkedin.com/v2/userinfo';
const JWKS_ENDPOINT = 'https://www.linkedin.com/oauth/openid/jwks';
const EXPECTED_ISSUER = 'https://www.linkedin.com';
const CLOCK_TOLERANCE_SECONDS = 60;
const JWKS_CACHE_SECONDS = 6 * 60 * 60;

let jwksCache = { expiresAt: 0, keys: [] };

function oauthError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse(response, code) {
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch (error) {}
  if (!response.ok) throw oauthError(code, 'LinkedIn request failed with status ' + response.status + '.');
  return payload;
}

export function linkedinAuthorizationUrl(transaction, event) {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', linkedinClientId());
  url.searchParams.set('redirect_uri', linkedinRedirectUri(event));
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('nonce', transaction.nonce);
  url.searchParams.set('code_challenge', createHash('sha256').update(transaction.codeVerifier).digest('base64url'));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', 'openid profile email');
  return url.href;
}

export async function exchangeCode(code, event, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: linkedinClientId(),
    client_secret: linkedinClientSecret(),
    redirect_uri: linkedinRedirectUri(event),
    code_verifier: String(codeVerifier || '')
  });
  const response = await fetchWithTimeout(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });
  const payload = await parseJsonResponse(response, 'TOKEN_EXCHANGE_FAILED');
  if (!payload.access_token || !payload.id_token) throw oauthError('TOKEN_RESPONSE_INVALID', 'LinkedIn did not return the required tokens.');
  return {
    accessToken: String(payload.access_token),
    idToken: String(payload.id_token),
    expiresIn: Number(payload.expires_in) || 0
  };
}

function decodeJwtPart(value, code) {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch (error) { throw oauthError(code, 'The LinkedIn ID token is malformed.'); }
}

async function loadJwks(forceRefresh = false) {
  const now = Math.floor(Date.now() / 1000);
  if (!forceRefresh && jwksCache.expiresAt > now && jwksCache.keys.length) return jwksCache.keys;
  const response = await fetchWithTimeout(JWKS_ENDPOINT, { headers: { Accept: 'application/json' } });
  const payload = await parseJsonResponse(response, 'JWKS_FETCH_FAILED');
  const keys = Array.isArray(payload.keys) ? payload.keys.filter((key) => key && key.kty === 'RSA') : [];
  if (!keys.length) throw oauthError('JWKS_INVALID', 'LinkedIn returned no usable signing keys.');
  jwksCache = { expiresAt: now + JWKS_CACHE_SECONDS, keys };
  return keys;
}

async function findJwk(kid) {
  let keys = await loadJwks(false);
  let key = keys.find((item) => item.kid === kid);
  if (!key) {
    keys = await loadJwks(true);
    key = keys.find((item) => item.kid === kid);
  }
  if (!key) throw oauthError('SIGNING_KEY_NOT_FOUND', 'The LinkedIn signing key was not found.');
  return key;
}

function audienceMatches(audience, clientId) {
  return Array.isArray(audience) ? audience.includes(clientId) : audience === clientId;
}

export async function validateIdToken(idToken, expectedNonce) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw oauthError('ID_TOKEN_INVALID', 'The LinkedIn ID token is malformed.');
  const header = decodeJwtPart(parts[0], 'ID_TOKEN_HEADER_INVALID');
  const payload = decodeJwtPart(parts[1], 'ID_TOKEN_PAYLOAD_INVALID');
  if (header.alg !== 'RS256' || !header.kid) throw oauthError('ID_TOKEN_ALGORITHM_INVALID', 'The LinkedIn ID token algorithm is not accepted.');
  const jwk = await findJwk(header.kid);
  if (jwk.alg && jwk.alg !== 'RS256') throw oauthError('SIGNING_KEY_INVALID', 'The LinkedIn signing key is not accepted.');
  let publicKey;
  try { publicKey = createPublicKey({ key: jwk, format: 'jwk' }); }
  catch (error) { throw oauthError('SIGNING_KEY_INVALID', 'The LinkedIn signing key is invalid.'); }
  const validSignature = verifySignature(
    'RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1], 'utf8'),
    publicKey,
    Buffer.from(parts[2], 'base64url')
  );
  if (!validSignature) throw oauthError('ID_TOKEN_SIGNATURE_INVALID', 'The LinkedIn ID token signature is invalid.');

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== EXPECTED_ISSUER) throw oauthError('ID_TOKEN_ISSUER_INVALID', 'The LinkedIn ID token issuer is invalid.');
  if (!audienceMatches(payload.aud, linkedinClientId())) throw oauthError('ID_TOKEN_AUDIENCE_INVALID', 'The LinkedIn ID token audience is invalid.');
  if (payload.azp && payload.azp !== linkedinClientId()) throw oauthError('ID_TOKEN_AUTHORIZED_PARTY_INVALID', 'The LinkedIn ID token authorized party is invalid.');
  if (!Number.isFinite(payload.exp) || payload.exp <= now - CLOCK_TOLERANCE_SECONDS) throw oauthError('ID_TOKEN_EXPIRED', 'The LinkedIn ID token is expired.');
  if (!Number.isFinite(payload.iat) || payload.iat > now + CLOCK_TOLERANCE_SECONDS) throw oauthError('ID_TOKEN_TIME_INVALID', 'The LinkedIn ID token time is invalid.');
  if (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf > now + CLOCK_TOLERANCE_SECONDS)) throw oauthError('ID_TOKEN_NOT_ACTIVE', 'The LinkedIn ID token is not active yet.');
  if (!payload.sub || typeof payload.sub !== 'string') throw oauthError('ID_TOKEN_SUBJECT_INVALID', 'The LinkedIn ID token subject is missing.');
  if (requireNonce() && payload.nonce !== expectedNonce) throw oauthError('ID_TOKEN_NONCE_INVALID', 'The LinkedIn ID token nonce is invalid.');
  if (payload.nonce && payload.nonce !== expectedNonce) throw oauthError('ID_TOKEN_NONCE_INVALID', 'The LinkedIn ID token nonce is invalid.');
  return payload;
}

export async function fetchUserInfo(accessToken, expectedSubject) {
  const response = await fetchWithTimeout(USERINFO_ENDPOINT, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + accessToken
    }
  });
  const payload = await parseJsonResponse(response, 'USERINFO_FETCH_FAILED');
  if (!payload.sub || payload.sub !== expectedSubject) throw oauthError('USERINFO_SUBJECT_MISMATCH', 'LinkedIn returned a different member subject.');
  return payload;
}

function cleanText(value, maximum) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum);
}

function cleanPicture(value) {
  const raw = cleanText(value, 600);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch (error) {
    return '';
  }
}

export function normalizeLinkedInProfile(idClaims, userInfo) {
  const claims = { ...(idClaims || {}), ...(userInfo || {}) };
  const emailVerified = claims.email_verified === true;
  const email = cleanText(claims.email, 320).toLowerCase();
  const firstName = cleanText(claims.given_name, 100);
  const lastName = cleanText(claims.family_name, 100);
  const displayName = cleanText(claims.name, 200) || [firstName, lastName].filter(Boolean).join(' ');
  return {
    provider: 'linkedin',
    subject: cleanText(claims.sub, 300),
    firstName,
    lastName,
    displayName,
    email: emailVerified && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    emailVerified,
    avatarUrl: cleanPicture(claims.picture),
    locale: cleanText(claims.locale, 35),
    importedAt: new Date().toISOString()
  };
}
