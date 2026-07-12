import { randomBytes } from 'node:crypto';
import { oauthTtlSeconds, secureCookies, sessionTtlSeconds, signingSecrets } from './config.mjs';
import { clearCookie, parseCookies, serializeCookie } from './cookies.mjs';
import { signToken, verifyToken } from './signed-token.mjs';

export const SESSION_COOKIE = 'plk_session';
export const OAUTH_COOKIE = 'plk_linkedin_tx';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function cookieOptions(event, path, maxAge) {
  return {
    path,
    maxAge,
    httpOnly: true,
    secure: secureCookies(event),
    sameSite: 'Lax'
  };
}

export function createOAuthTransaction(input, event) {
  const now = nowSeconds();
  const transaction = {
    typ: 'oauth-transaction',
    v: 1,
    iat: now,
    exp: now + oauthTtlSeconds(),
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    intent: input.intent,
    role: input.role,
    next: input.next,
    referralCode: input.referralCode || '',
    existingUserId: input.existingUserId || ''
  };
  const token = signToken(transaction, signingSecrets()[0]);
  return {
    transaction,
    cookie: serializeCookie(OAUTH_COOKIE, token, cookieOptions(event, '/api/v1/auth/linkedin', oauthTtlSeconds()))
  };
}

export function readOAuthTransaction(event) {
  const token = parseCookies(event)[OAUTH_COOKIE];
  if (!token) return null;
  try { return verifyToken(token, signingSecrets(), 'oauth-transaction'); }
  catch (error) { return null; }
}

export function clearOAuthCookie(event) {
  return clearCookie(OAUTH_COOKIE, cookieOptions(event, '/api/v1/auth/linkedin', 0));
}

function cleanText(value, maximum = 200) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum);
}

function cleanUrl(value) {
  const raw = cleanText(value, 600);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch (error) {
    return '';
  }
}

export function normalizeUser(user, fallbackRole) {
  const role = user && user.role === 'client' ? 'client' : (user && user.role === 'freelancer' ? 'freelancer' : fallbackRole);
  if (role !== 'client' && role !== 'freelancer') throw new Error('INVALID_USER_ROLE');
  const id = cleanText(user && user.id, 160);
  if (!id) throw new Error('INVALID_USER_ID');
  const firstName = cleanText(user && user.firstName, 100);
  const lastName = cleanText(user && user.lastName, 100);
  const displayName = cleanText(user && (user.displayName || user.name), 200) || [firstName, lastName].filter(Boolean).join(' ');
  const email = cleanText(user && user.email, 320).toLowerCase();
  return {
    id,
    role,
    displayName,
    firstName,
    lastName,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    emailVerified: user && user.emailVerified === true,
    avatarUrl: cleanUrl(user && (user.avatarUrl || user.picture)),
    locale: cleanText(user && user.locale, 35)
  };
}

export function createSessionPayload(input) {
  const now = nowSeconds();
  const user = normalizeUser(input.user, input.role);
  const providers = Array.from(new Set((Array.isArray(input.providers) ? input.providers : [input.provider])
    .map((item) => cleanText(item, 32).toLowerCase())
    .filter((item) => item === 'linkedin' || item === 'whatsapp' || item === 'facebook')));
  const provider = providers.includes(input.provider) ? input.provider : (providers[0] || 'linkedin');
  const linkedinProfile = input.linkedinProfile && typeof input.linkedinProfile === 'object'
    ? {
        firstName: cleanText(input.linkedinProfile.firstName, 100),
        lastName: cleanText(input.linkedinProfile.lastName, 100),
        displayName: cleanText(input.linkedinProfile.displayName, 200),
        email: cleanText(input.linkedinProfile.email, 320).toLowerCase(),
        emailVerified: input.linkedinProfile.emailVerified === true,
        avatarUrl: cleanUrl(input.linkedinProfile.avatarUrl),
        locale: cleanText(input.linkedinProfile.locale, 35),
        importedAt: cleanText(input.linkedinProfile.importedAt, 40)
      }
    : null;
  return {
    typ: 'session',
    v: 1,
    iat: now,
    exp: now + sessionTtlSeconds(),
    authenticated: true,
    user,
    auth: {
      provider,
      providers,
      phoneVerified: input.phoneVerified === true
    },
    linkedinProfile,
    referralCode: cleanText(input.referralCode, 48),
    storageMode: input.storageMode === 'external-adapter' ? 'external-adapter' : 'signed-cookie-preview'
  };
}

export function sessionCookie(session, event) {
  const token = signToken(session, signingSecrets()[0]);
  if (Buffer.byteLength(token, 'utf8') > 3800) throw new Error('SESSION_COOKIE_TOO_LARGE');
  return serializeCookie(SESSION_COOKIE, token, cookieOptions(event, '/', sessionTtlSeconds()));
}

export function readSession(event) {
  const token = parseCookies(event)[SESSION_COOKIE];
  if (!token) return null;
  try { return verifyToken(token, signingSecrets(), 'session'); }
  catch (error) { return null; }
}

export function clearSessionCookie(event) {
  return clearCookie(SESSION_COOKIE, cookieOptions(event, '/', 0));
}

export function publicSession(session) {
  if (!session) return { authenticated: false };
  return {
    authenticated: true,
    user: session.user,
    auth: session.auth,
    profileImport: session.linkedinProfile
      ? {
          available: true,
          source: 'linkedin',
          importedAt: session.linkedinProfile.importedAt || '',
          fields: {
            firstName: session.linkedinProfile.firstName || '',
            lastName: session.linkedinProfile.lastName || '',
            displayName: session.linkedinProfile.displayName || '',
            email: session.linkedinProfile.emailVerified ? session.linkedinProfile.email || '' : '',
            emailVerified: session.linkedinProfile.emailVerified === true,
            avatarUrl: session.linkedinProfile.avatarUrl || '',
            locale: session.linkedinProfile.locale || ''
          }
        }
      : { available: false, source: 'linkedin' },
    storageMode: session.storageMode || 'signed-cookie-preview',
    expiresAt: new Date(session.exp * 1000).toISOString()
  };
}
