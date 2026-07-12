import { createHmac } from 'node:crypto';
import {
  facebookClientId,
  facebookClientSecret,
  facebookGraphVersion,
  facebookRedirectUri
} from './config.mjs';

const AUTHORIZATION_ENDPOINT = 'https://www.facebook.com/dialog/oauth';
const GRAPH_ORIGIN = 'https://graph.facebook.com';
const MAX_RESPONSE_BYTES = 512 * 1024;

function oauthError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw oauthError('FACEBOOK_RESPONSE_TOO_LARGE', 'Facebook returned too much data.');
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; }
    catch (error) { throw oauthError('FACEBOOK_RESPONSE_INVALID', 'Facebook returned invalid JSON.'); }
    if (!response.ok || payload.error) throw oauthError('FACEBOOK_REQUEST_FAILED', 'Facebook rejected the request.');
    return payload;
  } catch (error) {
    if (error && error.name === 'AbortError') throw oauthError('FACEBOOK_TIMEOUT', 'Facebook did not respond in time.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function graphUrl(pathname, parameters) {
  const url = new URL('/' + facebookGraphVersion() + '/' + String(pathname || '').replace(/^\/+/, ''), GRAPH_ORIGIN);
  Object.entries(parameters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url;
}

export function facebookAuthorizationUrl(transaction, event) {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', facebookClientId());
  url.searchParams.set('redirect_uri', facebookRedirectUri(event));
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'public_profile,email');
  return url.href;
}

export async function exchangeFacebookCode(code, event) {
  const payload = await fetchJson(graphUrl('oauth/access_token', {
    client_id: facebookClientId(),
    client_secret: facebookClientSecret(),
    redirect_uri: facebookRedirectUri(event),
    code
  }), { headers: { Accept: 'application/json' } });
  const accessToken = String(payload.access_token || '');
  if (!accessToken) throw oauthError('FACEBOOK_TOKEN_INVALID', 'Facebook did not return an access token.');
  return { accessToken, expiresIn: Number(payload.expires_in) || 0 };
}

export async function validateFacebookToken(accessToken) {
  const payload = await fetchJson(graphUrl('debug_token', {
    input_token: accessToken,
    access_token: facebookClientId() + '|' + facebookClientSecret()
  }), { headers: { Accept: 'application/json' } });
  const data = payload && payload.data && typeof payload.data === 'object' ? payload.data : {};
  if (data.is_valid !== true) throw oauthError('FACEBOOK_TOKEN_INVALID', 'The Facebook token is invalid.');
  if (String(data.app_id || '') !== facebookClientId()) throw oauthError('FACEBOOK_APP_MISMATCH', 'The Facebook token belongs to another app.');
  const subject = String(data.user_id || '').trim();
  if (!subject) throw oauthError('FACEBOOK_SUBJECT_INVALID', 'Facebook did not return an account ID.');
  const now = Math.floor(Date.now() / 1000);
  if (Number(data.expires_at) > 0 && Number(data.expires_at) <= now) throw oauthError('FACEBOOK_TOKEN_EXPIRED', 'The Facebook token expired.');
  return { subject };
}

export async function fetchFacebookProfile(accessToken, expectedSubject) {
  const proof = createHmac('sha256', facebookClientSecret()).update(accessToken).digest('hex');
  const payload = await fetchJson(graphUrl('me', {
    fields: 'id,first_name,last_name,name,email,picture.type(large)',
    access_token: accessToken,
    appsecret_proof: proof
  }), { headers: { Accept: 'application/json' } });
  if (String(payload.id || '') !== String(expectedSubject || '')) throw oauthError('FACEBOOK_SUBJECT_MISMATCH', 'Facebook returned a different account.');
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
  } catch (error) { return ''; }
}

export function normalizeFacebookProfile(profile) {
  const firstName = cleanText(profile && profile.first_name, 100);
  const lastName = cleanText(profile && profile.last_name, 100);
  const displayName = cleanText(profile && profile.name, 200) || [firstName, lastName].filter(Boolean).join(' ');
  const email = cleanText(profile && profile.email, 320).toLowerCase();
  const picture = profile && profile.picture && profile.picture.data ? profile.picture.data.url : '';
  return {
    provider: 'facebook',
    subject: cleanText(profile && profile.id, 300),
    firstName,
    lastName,
    displayName,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    emailVerified: false,
    avatarUrl: cleanPicture(picture),
    locale: '',
    importedAt: new Date().toISOString()
  };
}
