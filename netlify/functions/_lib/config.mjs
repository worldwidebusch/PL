const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_OAUTH_TTL_SECONDS = 10 * 60;

const APP_FILES = new Set([
  'Prolinker Homepage.dc.html',
  'Prolinker Login.dc.html',
  'Prolinker Brief.dc.html',
  'Prolinker Intake.dc.html',
  'Prolinker Results.dc.html',
  'Prolinker Dashboard.dc.html',
  'Prolinker Netwerk.dc.html',
  'Prolinker Mijn opdrachten.dc.html',
  'Prolinker Berichten.dc.html',
  'Prolinker Profiel.dc.html',
  'Prolinker Verdiensten.dc.html',
  'Prolinker Instellingen.dc.html',
  'Prolinker Voor jou v2.dc.html',
  'Prolinker Voor jou.dc.html',
  'Prolinker Feed.dc.html'
]);

function header(event, name) {
  const headers = event && event.headers && typeof event.headers === 'object' ? event.headers : {};
  const wanted = String(name || '').toLowerCase();
  const key = Object.keys(headers).find((item) => item.toLowerCase() === wanted);
  return key ? String(headers[key] || '') : '';
}

function validatedOrigin(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return '';
    return url.origin;
  } catch (error) {
    return '';
  }
}

function inferredOrigin(event) {
  const rawHost = header(event, 'x-forwarded-host') || header(event, 'host');
  if (!/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(rawHost)) return '';
  const forwardedProto = header(event, 'x-forwarded-proto').split(',')[0].trim().toLowerCase();
  const protocol = forwardedProto === 'http' ? 'http' : 'https';
  return validatedOrigin(protocol + '://' + rawHost);
}

export function appOrigin(event) {
  const configured = validatedOrigin(process.env.PROLINKER_APP_ORIGIN);
  const inferred = inferredOrigin(event);
  if (configured) return configured;
  if (inferred) return inferred;
  throw new Error('PROLINKER_APP_ORIGIN is not configured.');
}

export function linkedinClientId() {
  const value = String(process.env.LINKEDIN_CLIENT_ID || '').trim();
  if (!value) throw new Error('LINKEDIN_CLIENT_ID is not configured.');
  return value;
}

export function linkedinClientSecret() {
  const value = String(process.env.LINKEDIN_CLIENT_SECRET || '').trim();
  if (!value) throw new Error('LINKEDIN_CLIENT_SECRET is not configured.');
  return value;
}

export function linkedinRedirectUri(event) {
  const raw = String(process.env.LINKEDIN_REDIRECT_URI || '').trim();
  if (!raw) return appOrigin(event) + '/api/v1/auth/linkedin/callback';
  try {
    const url = new URL(raw);
    const local = /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('invalid protocol');
    if (url.username || url.password || url.hash) throw new Error('invalid redirect URI');
    return url.href;
  } catch (error) {
    throw new Error('LINKEDIN_REDIRECT_URI must be an absolute HTTPS URL.');
  }
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function sessionTtlSeconds() {
  return boundedInteger(process.env.PROLINKER_SESSION_TTL_SECONDS, DEFAULT_SESSION_TTL_SECONDS, 300, 30 * 24 * 60 * 60);
}

export function oauthTtlSeconds() {
  return boundedInteger(process.env.PROLINKER_OAUTH_TTL_SECONDS, DEFAULT_OAUTH_TTL_SECONDS, 120, 15 * 60);
}

export function referralLinkTtlSeconds() {
  return boundedInteger(process.env.PROLINKER_REFERRAL_LINK_TTL_SECONDS, 90 * 24 * 60 * 60, 24 * 60 * 60, 365 * 24 * 60 * 60);
}

export function signingSecrets() {
  const current = String(process.env.PROLINKER_SESSION_SECRET || '');
  const previous = String(process.env.PROLINKER_SESSION_SECRET_PREVIOUS || '');
  if (Buffer.byteLength(current, 'utf8') < 32) {
    throw new Error('PROLINKER_SESSION_SECRET must contain at least 32 bytes.');
  }
  return previous && Buffer.byteLength(previous, 'utf8') >= 32 ? [current, previous] : [current];
}

export function requireNonce() {
  return String(process.env.PROLINKER_REQUIRE_NONCE || 'true').toLowerCase() !== 'false';
}

export function secureCookies(event) {
  const origin = appOrigin(event);
  const local = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(origin);
  const allowInsecure = String(process.env.PROLINKER_ALLOW_INSECURE_COOKIES || '').toLowerCase() === 'true';
  return !(local && allowInsecure);
}

export function sanitizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return role === 'client' || role === 'freelancer' ? role : '';
}

export function sanitizeIntent(value) {
  const intent = String(value || '').trim().toLowerCase();
  if (intent === 'register') return 'register';
  if (intent === 'import' || intent === 'link') return 'import';
  return intent === 'login' ? 'login' : '';
}

export function sanitizeReferralCode(value) {
  const code = String(value || '').trim().toLowerCase();
  return /^[a-z0-9-]{4,48}$/.test(code) ? code : '';
}

export function defaultNextPath(role, intent) {
  if (intent === 'import') return '/project/Prolinker%20Profiel.dc.html';
  return role === 'freelancer'
    ? '/project/Prolinker%20Voor%20jou%20v2.dc.html'
    : '/project/Prolinker%20Dashboard.dc.html';
}

export function sanitizeNextPath(value, role, intent) {
  const fallback = defaultNextPath(role, intent);
  let raw = String(value || '').trim();
  if (!raw) return fallback;
  if (raw.length > 600 || /[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  if (/^[^/?#]+\.dc\.html(?:[?#]|$)/i.test(raw)) raw = '/project/' + raw;
  try {
    const base = new URL('https://prolinker.invalid/');
    const parsed = new URL(raw, base);
    if (parsed.origin !== base.origin || parsed.username || parsed.password) return fallback;
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (decodedPath === '/' || decodedPath === '/index.html') return parsed.pathname + parsed.search;
    if (!decodedPath.startsWith('/project/')) return fallback;
    const fileName = decodedPath.slice('/project/'.length);
    if (!APP_FILES.has(fileName)) return fallback;
    return parsed.pathname + parsed.search;
  } catch (error) {
    return fallback;
  }
}

export function sanitizeReferralTarget(value, event) {
  let raw = String(value || '').trim();
  if (!raw || raw.length > 1000 || /[\u0000-\u001f\u007f\\]/.test(raw)) return '';
  if (/^[^/?#]+\.dc\.html(?:[?#]|$)/i.test(raw)) raw = '/project/' + raw;
  try {
    const origin = appOrigin(event);
    const parsed = new URL(raw, origin + '/');
    if (parsed.origin !== origin || parsed.username || parsed.password) return '';
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (decodedPath === '/' || decodedPath === '/index.html') {
      ['ref', 'via', 'share'].forEach((name) => parsed.searchParams.delete(name));
      return parsed.pathname + parsed.search;
    }
    if (!decodedPath.startsWith('/project/')) return '';
    const fileName = decodedPath.slice('/project/'.length);
    if (!APP_FILES.has(fileName)) return '';
    ['ref', 'via', 'share'].forEach((name) => parsed.searchParams.delete(name));
    return parsed.pathname + parsed.search;
  } catch (error) {
    return '';
  }
}

export function identityAdapterConfig() {
  const rawUrl = String(process.env.PROLINKER_IDENTITY_ADAPTER_URL || '').trim();
  if (!rawUrl) return null;
  let url;
  try {
    url = new URL(rawUrl);
  } catch (error) {
    throw new Error('PROLINKER_IDENTITY_ADAPTER_URL is invalid.');
  }
  const local = /^(?:localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);
  if (url.username || url.password || url.hash) {
    throw new Error('PROLINKER_IDENTITY_ADAPTER_URL must not contain credentials or a fragment.');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('PROLINKER_IDENTITY_ADAPTER_URL must use HTTPS.');
  }
  const token = String(process.env.PROLINKER_IDENTITY_ADAPTER_TOKEN || '').trim();
  if (!token) throw new Error('PROLINKER_IDENTITY_ADAPTER_TOKEN is required when the adapter URL is set.');
  return { url: url.href, token };
}

export function eventHeader(event, name) {
  return header(event, name);
}
