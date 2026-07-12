import { createHmac, randomBytes } from 'node:crypto';
import { allowPreviewAuth, backendAdapterConfig, eventHeader, oauthTtlSeconds, secureCookies, sessionTtlSeconds, signingSecrets } from './config.mjs';
import { clearCookie, parseCookies, serializeCookie } from './cookies.mjs';
import { callPrivateAdapter } from './private-adapter.mjs';
import { signToken, verifyToken } from './signed-token.mjs';

export const SESSION_COOKIE = 'plk_session';
export const HOST_SESSION_COOKIE = '__Host-plk_session';
export const OAUTH_COOKIE = 'plk_linkedin_tx';
export const FACEBOOK_OAUTH_COOKIE = 'plk_facebook_tx';

function oauthProvider(value) {
  return value === 'facebook' ? 'facebook' : 'linkedin';
}

function oauthCookieName(provider) {
  return oauthProvider(provider) === 'facebook' ? FACEBOOK_OAUTH_COOKIE : OAUTH_COOKIE;
}

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

export function createOAuthTransaction(input, event, provider = 'linkedin') {
  const safeProvider = oauthProvider(provider);
  const now = nowSeconds();
  const profile = input.intent === 'register' && input.registrationProfile && typeof input.registrationProfile === 'object'
    ? {
        firstName: cleanText(input.registrationProfile.firstName, 100),
        lastName: cleanText(input.registrationProfile.lastName, 100),
        displayName: cleanText(input.registrationProfile.displayName, 200),
        email: cleanText(input.registrationProfile.email, 320).toLowerCase(),
        companyName: cleanText(input.registrationProfile.companyName, 160),
        category: cleanText(input.registrationProfile.category, 160),
        locale: cleanText(input.registrationProfile.locale, 35)
      }
    : null;
  const consent = input.intent === 'register' && input.registrationConsent && typeof input.registrationConsent === 'object'
    ? {
        termsVersion: cleanText(input.registrationConsent.termsVersion, 64),
        privacyVersion: cleanText(input.registrationConsent.privacyVersion, 64),
        acceptedAt: cleanText(input.registrationConsent.acceptedAt, 40)
      }
    : null;
  const transaction = {
    typ: 'oauth-transaction',
    v: 2,
    iat: now,
    exp: now + oauthTtlSeconds(),
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    codeVerifier: randomBytes(48).toString('base64url'),
    provider: safeProvider,
    intent: input.intent,
    role: input.role,
    next: input.next,
    referralCode: input.referralCode || '',
    existingUserId: input.existingUserId || '',
    registrationProfile: profile,
    registrationConsent: consent
  };
  const token = signToken(transaction, signingSecrets()[0]);
  return {
    transaction,
    cookie: serializeCookie(oauthCookieName(safeProvider), token, cookieOptions(event, '/api/v1/auth/' + safeProvider, oauthTtlSeconds()))
  };
}

export function readOAuthTransaction(event, provider = 'linkedin') {
  const safeProvider = oauthProvider(provider);
  const token = parseCookies(event)[oauthCookieName(safeProvider)];
  if (!token) return null;
  try {
    const transaction = verifyToken(token, signingSecrets(), 'oauth-transaction');
    return transaction.provider === safeProvider ? transaction : null;
  }
  catch (error) { return null; }
}

export function clearOAuthCookie(event, provider = 'linkedin') {
  const safeProvider = oauthProvider(provider);
  return clearCookie(oauthCookieName(safeProvider), cookieOptions(event, '/api/v1/auth/' + safeProvider, 0));
}

export function clearAllOAuthCookies(event) {
  return [clearOAuthCookie(event, 'linkedin'), clearOAuthCookie(event, 'facebook')];
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

function opaqueSessionToken(event) {
  const cookies = parseCookies(event);
  return cookies[HOST_SESSION_COOKIE] || cookies[SESSION_COOKIE] || '';
}

function opaqueSessionHash(token, secret = signingSecrets()[0]) {
  return createHmac('sha256', secret).update('session:' + token).digest('base64url');
}

function opaqueSessionHashes(token) {
  return Array.from(new Set(signingSecrets().map((secret) => opaqueSessionHash(token, secret))));
}

function sessionCookieName(event) {
  return secureCookies(event) ? HOST_SESSION_COOKIE : SESSION_COOKIE;
}

function sessionRequestContext(event) {
  const forwarded = eventHeader(event, 'x-nf-client-connection-ip') || eventHeader(event, 'x-forwarded-for').split(',')[0].trim();
  const sourceIp = cleanText(event && event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp, 80);
  return {
    clientIp: cleanText(forwarded, 80) || sourceIp,
    userAgent: cleanText(eventHeader(event, 'user-agent'), 500)
  };
}

export async function issueSessionCookie(session, event) {
  if (!backendAdapterConfig()) {
    if (!allowPreviewAuth()) throw Object.assign(new Error('A durable session adapter is required.'), { code: 'SESSION_ADAPTER_REQUIRED', status: 503 });
    return sessionCookie(session, event);
  }
  const token = randomBytes(32).toString('base64url');
  const tokenHash = opaqueSessionHashes(token)[0];
  await callPrivateAdapter('createSession', {
    session: {
      tokenHash,
      userId: session.user.id,
      role: session.user.role,
      provider: session.auth.provider,
      providers: session.auth.providers,
      phoneVerified: session.auth.phoneVerified === true,
      referralCode: session.referralCode || '',
      createdAt: new Date(session.iat * 1000).toISOString(),
      expiresAt: new Date(session.exp * 1000).toISOString()
    },
    context: sessionRequestContext(event)
  });
  return serializeCookie(sessionCookieName(event), token, cookieOptions(event, '/', sessionTtlSeconds()));
}

export async function readSession(event) {
  const token = opaqueSessionToken(event);
  if (!token) return null;
  if (token.includes('.')) {
    if (!allowPreviewAuth()) return null;
    try { return verifyToken(token, signingSecrets(), 'session'); }
    catch (error) { return null; }
  }
  if (!backendAdapterConfig()) return null;
  try {
    let resolved = null;
    for (const tokenHash of opaqueSessionHashes(token)) {
      try {
        const candidate = await callPrivateAdapter('resolveSession', { session: { tokenHash } });
        const candidateData = candidate.data && typeof candidate.data === 'object' ? candidate.data : {};
        if (candidateData.revoked === true) return null;
        if (candidateData.user) {
          resolved = candidate;
          break;
        }
      } catch (error) {
        const status = Number(error && error.status);
        if (status !== 401 && status !== 404) throw error;
      }
    }
    if (!resolved) return null;
    const data = resolved.data && typeof resolved.data === 'object' ? resolved.data : {};
    if (data.revoked === true || !data.user) return null;
    const record = data.session && typeof data.session === 'object' ? data.session : data;
    const session = createSessionPayload({
      user: data.user,
      role: data.user.role,
      provider: record.provider,
      providers: record.providers,
      phoneVerified: record.phoneVerified === true,
      linkedinProfile: data.linkedinProfile || null,
      referralCode: record.referralCode || '',
      storageMode: 'external-adapter'
    });
    if (typeof record.expiresAt !== 'string' || !record.expiresAt.trim()) return null;
    const expiresAt = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiresAt)) return null;
    session.exp = Math.floor(expiresAt / 1000);
    if (session.exp <= nowSeconds()) return null;
    return session;
  } catch (error) {
    const status = Number(error && error.status);
    if (status === 401 || status === 404) return null;
    throw error;
  }
}

export function clearSessionCookie(event) {
  return [
    clearCookie(HOST_SESSION_COOKIE, { ...cookieOptions(event, '/', 0), secure: true }),
    clearCookie(SESSION_COOKIE, cookieOptions(event, '/', 0))
  ];
}

export async function revokeSession(event) {
  const token = opaqueSessionToken(event);
  if (!token || token.includes('.') || !backendAdapterConfig()) return false;
  const revokedAt = new Date().toISOString();
  let revoked = false;
  for (const tokenHash of opaqueSessionHashes(token)) {
    try {
      await callPrivateAdapter('revokeSession', { session: { tokenHash, revokedAt } });
      revoked = true;
    } catch (error) {
      const status = Number(error && error.status);
      if (status !== 401 && status !== 404) throw error;
    }
  }
  return revoked;
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
