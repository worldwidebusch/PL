import { appOrigin, eventHeader } from './config.mjs';

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
});

export function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { ...SECURITY_HEADERS, ...headers },
    body: body === undefined || body === null ? '' : String(body)
  };
}

export function json(statusCode, payload, headers = {}) {
  return response(statusCode, JSON.stringify(payload), {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers
  });
}

export function redirect(location, statusCode = 302, headers = {}) {
  return response(statusCode, '', { Location: location, ...headers });
}

export function withCookies(result, cookies) {
  const values = (Array.isArray(cookies) ? cookies : [cookies]).filter(Boolean);
  if (!values.length) return result;
  return {
    ...result,
    multiValueHeaders: {
      ...(result.multiValueHeaders || {}),
      'Set-Cookie': values
    }
  };
}

export function methodNotAllowed(allowed) {
  return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, {
    Allow: allowed.join(', ')
  });
}

export function parseJsonBody(event, maximumBytes = 8192) {
  const raw = event && event.body ? String(event.body) : '';
  if (Buffer.byteLength(raw, 'utf8') > maximumBytes) throw new Error('REQUEST_TOO_LARGE');
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('INVALID_JSON');
  return parsed;
}

export function assertSameOrigin(event) {
  const expected = appOrigin(event);
  const origin = eventHeader(event, 'origin');
  if (origin) {
    let normalized = '';
    try { normalized = new URL(origin).origin; } catch (error) {}
    if (normalized === expected) return;
    throw new Error('ORIGIN_MISMATCH');
  }
  const referer = eventHeader(event, 'referer');
  if (referer) {
    let normalized = '';
    try { normalized = new URL(referer).origin; } catch (error) {}
    if (normalized === expected) return;
  }
  throw new Error('ORIGIN_MISMATCH');
}

export function queryParameters(event) {
  const direct = event && event.queryStringParameters && typeof event.queryStringParameters === 'object'
    ? event.queryStringParameters
    : {};
  return new URLSearchParams(Object.entries(direct).filter((entry) => entry[1] !== undefined && entry[1] !== null));
}

export function safeErrorCode(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  if (/^[A-Z0-9_]{3,48}$/.test(code)) return code;
  const message = error && error.message ? String(error.message) : '';
  if (message === 'ORIGIN_MISMATCH') return 'ORIGIN_MISMATCH';
  if (message === 'REQUEST_TOO_LARGE') return 'REQUEST_TOO_LARGE';
  if (message === 'INVALID_JSON') return 'INVALID_JSON';
  return 'REQUEST_FAILED';
}

