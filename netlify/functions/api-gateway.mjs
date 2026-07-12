import { randomUUID } from 'node:crypto';
import { normalizeApiPath, resolveApiRoute } from './_lib/api-route-contracts.mjs';
import { eventHeader } from './_lib/config.mjs';
import { adapterErrorResponse, callPrivateAdapter } from './_lib/private-adapter.mjs';
import { assertSameOrigin, json, parseJsonBody, response } from './_lib/http.mjs';
import { readSession } from './_lib/session.mjs';

const SUPPORTED_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const MAX_QUERY_BYTES = 16 * 1024;
const MAX_QUERY_FIELDS = 64;
const MAX_QUERY_VALUES = 128;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_BODY_DEPTH = 8;
const MAX_BODY_KEYS = 300;
const MAX_ARRAY_ITEMS = 250;
const MAX_STRING_LENGTH = 32768;
const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

class GatewayError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function requestIdFor(event) {
  const supplied = eventHeader(event, 'x-request-id') || eventHeader(event, 'x-correlation-id');
  const clean = String(supplied || '').trim();
  return /^[A-Za-z0-9._:-]{1,160}$/.test(clean) ? clean : randomUUID();
}

function responseHeaders(requestId, extra = {}) {
  return { 'X-ProLinker-Request-Id': requestId, Vary: 'Cookie', ...extra };
}

function fail(status, code, message, requestId, extraHeaders = {}) {
  return json(status, {
    error: { code, message },
    requestId
  }, responseHeaders(requestId, extraHeaders));
}

function actorFor(session) {
  if (!session || !session.user) return null;
  const auth = session.auth && typeof session.auth === 'object' ? session.auth : {};
  return {
    userId: String(session.user.id || ''),
    role: session.user.role === 'client' ? 'client' : 'freelancer',
    provider: String(auth.provider || ''),
    providers: Array.isArray(auth.providers) ? auth.providers.slice(0, 8).map(String) : []
  };
}

function cleanQueryValue(value) {
  const text = String(value === undefined || value === null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  if (text.length > 1000) throw new GatewayError('INVALID_QUERY', 'A query value is too long.');
  return text;
}

function querySource(event) {
  const multiple = event && event.multiValueQueryStringParameters;
  if (multiple && typeof multiple === 'object') return multiple;
  const direct = event && event.queryStringParameters;
  return direct && typeof direct === 'object' ? direct : {};
}

function sanitizeQuery(event, allowedFields) {
  const source = querySource(event);
  const allowed = new Set(allowedFields || []);
  const result = {};
  const keys = Object.keys(source).filter((key) => key !== 'path');
  if (keys.length > MAX_QUERY_FIELDS) throw new GatewayError('INVALID_QUERY', 'Too many query fields.');
  let valuesSeen = 0;
  let bytes = 0;
  for (const key of keys) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key) || BLOCKED_KEYS.has(key)) {
      throw new GatewayError('INVALID_QUERY', 'A query field is invalid.');
    }
    if (!allowed.has(key)) throw new GatewayError('UNKNOWN_QUERY_FIELD', 'Unsupported query field: ' + key + '.');
    const incoming = Array.isArray(source[key]) ? source[key] : [source[key]];
    if (incoming.length > 50) throw new GatewayError('INVALID_QUERY', 'Too many values for query field: ' + key + '.');
    const cleaned = incoming.map(cleanQueryValue).filter((value) => value !== '');
    valuesSeen += cleaned.length;
    if (valuesSeen > MAX_QUERY_VALUES) throw new GatewayError('INVALID_QUERY', 'Too many query values.');
    cleaned.forEach((value) => { bytes += Buffer.byteLength(key + value, 'utf8'); });
    if (cleaned.length === 1) result[key] = cleaned[0];
    else if (cleaned.length > 1) result[key] = cleaned;
  }
  if (bytes > MAX_QUERY_BYTES) throw new GatewayError('QUERY_TOO_LARGE', 'The query is too large.', 413);
  return result;
}

function sanitizeJsonValue(value, state, depth = 0) {
  if (depth > MAX_BODY_DEPTH) throw new GatewayError('INVALID_BODY', 'The request body is too deeply nested.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new GatewayError('INVALID_BODY', 'The request body contains an invalid number.');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) throw new GatewayError('INVALID_BODY', 'A request field is too long.');
    return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw new GatewayError('INVALID_BODY', 'A request list is too long.');
    return value.map((item) => sanitizeJsonValue(item, state, depth + 1));
  }
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new GatewayError('INVALID_BODY', 'The request body contains an unsupported value.');
  }
  const output = {};
  for (const key of Object.keys(value)) {
    state.keys += 1;
    if (state.keys > MAX_BODY_KEYS) throw new GatewayError('INVALID_BODY', 'The request body has too many fields.');
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(key) || BLOCKED_KEYS.has(key)) {
      throw new GatewayError('INVALID_BODY', 'The request body contains an invalid field.');
    }
    output[key] = sanitizeJsonValue(value[key], state, depth + 1);
  }
  return output;
}

function sanitizeBody(event, contract) {
  const raw = event && event.body ? String(event.body) : '';
  if (!raw) return {};
  if (!contract.bodyMaxBytes) throw new GatewayError('UNEXPECTED_BODY', 'This endpoint does not accept a request body.');
  if (event && event.isBase64Encoded) throw new GatewayError('UNSUPPORTED_BODY', 'Encoded request bodies are not supported.', 415);
  const contentType = eventHeader(event, 'content-type').split(';')[0].trim().toLowerCase();
  if (contentType && contentType !== 'application/json') {
    throw new GatewayError('UNSUPPORTED_MEDIA_TYPE', 'Use application/json for this endpoint.', 415);
  }
  let parsed;
  try { parsed = parseJsonBody(event, contract.bodyMaxBytes); }
  catch (error) {
    if (error && error.message === 'REQUEST_TOO_LARGE') throw new GatewayError('REQUEST_TOO_LARGE', 'The request body is too large.', 413);
    throw new GatewayError('INVALID_JSON', 'The request body must contain valid JSON.');
  }
  const allowed = new Set(contract.bodyFields || []);
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) throw new GatewayError('UNKNOWN_BODY_FIELD', 'Unsupported request field: ' + key + '.');
  }
  return sanitizeJsonValue(parsed, { keys: 0 });
}

function idempotencyKeyFor(event) {
  const raw = String(eventHeader(event, 'idempotency-key') || '').trim();
  if (!raw) return '';
  if (raw.length > 200 || !/^[A-Za-z0-9._~:+/=\-]+$/.test(raw)) {
    throw new GatewayError('INVALID_IDEMPOTENCY_KEY', 'The Idempotency-Key header is invalid.');
  }
  return raw;
}

function authorize(session, contract) {
  if (!session && contract.auth !== 'optional') {
    throw new GatewayError('AUTH_REQUIRED', 'Log in to continue.', 401);
  }
  if (!session) return;
  const role = session.user && session.user.role;
  if (contract.roles.length && !contract.roles.includes(role)) {
    throw new GatewayError('FORBIDDEN', 'This action is not available for this account.', 403);
  }
}

function publicAdapterFailure(error) {
  const source = adapterErrorResponse(error);
  const status = source.status;
  const byStatus = {
    400: ['INVALID_REQUEST', 'The request was rejected.'],
    401: ['AUTH_REQUIRED', 'Log in to continue.'],
    403: ['FORBIDDEN', 'This action is not allowed.'],
    404: ['NOT_FOUND', 'The requested item was not found.'],
    409: ['CONFLICT', 'This change conflicts with the current state.'],
    413: ['REQUEST_TOO_LARGE', 'The request is too large.'],
    422: ['VALIDATION_ERROR', 'Check the submitted fields.'],
    429: ['RATE_LIMITED', 'Too many requests. Try again later.'],
    503: ['SERVICE_UNAVAILABLE', 'The service is temporarily unavailable.'],
    504: ['SERVICE_TIMEOUT', 'The service did not respond in time.']
  };
  const mapped = byStatus[status] || (status >= 500
    ? ['BACKEND_REQUEST_FAILED', 'The service is temporarily unavailable.']
    : ['BACKEND_REQUEST_FAILED', 'The request could not be completed.']);
  return { status, code: mapped[0], message: mapped[1] };
}

function success(result, requestId) {
  const status = Number(result && result.status);
  const safeStatus = status >= 200 && status <= 299 ? status : 200;
  if (safeStatus === 204) return response(204, '', responseHeaders(requestId));
  const data = result && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : { ok: true };
  const serialized = JSON.stringify(data === undefined ? { ok: true } : data);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new GatewayError('RESPONSE_TOO_LARGE', 'The service response is too large.', 502);
  }
  return response(safeStatus, serialized, responseHeaders(requestId, {
    'Content-Type': 'application/json; charset=utf-8'
  }));
}

export async function handler(event) {
  const requestId = requestIdFor(event);
  try {
    const method = String(event && event.httpMethod || '').toUpperCase();
    if (!SUPPORTED_METHODS.has(method)) {
      return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', requestId, {
        Allow: Array.from(SUPPORTED_METHODS).join(', ')
      });
    }
    const path = normalizeApiPath(event);
    const matched = resolveApiRoute(method, path);
    if (!matched) return fail(404, 'NOT_FOUND', 'API endpoint not found.', requestId);
    if (!matched.contract) {
      return fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', requestId, {
        Allow: matched.allowed.join(', ')
      });
    }
    if (MUTATION_METHODS.has(method)) assertSameOrigin(event);

    const session = await readSession(event);
    authorize(session, matched.contract);
    if (matched.contract.operation === 'updateProfile') {
      const actor = actorFor(session);
      if (!actor || (matched.params.id !== 'me' && matched.params.id !== actor.userId)) {
        throw new GatewayError('FORBIDDEN', 'You can only update your own profile.', 403);
      }
    }
    const query = sanitizeQuery(event, matched.contract.queryFields);
    const body = sanitizeBody(event, matched.contract);
    const idempotencyKey = idempotencyKeyFor(event);
    const payload = {
      actor: actorFor(session),
      params: matched.params,
      query,
      body
    };
    if (idempotencyKey) payload.idempotencyKey = idempotencyKey;
    const result = await callPrivateAdapter(matched.contract.operation, payload, { requestId });
    return success(result, requestId);
  } catch (error) {
    if (error instanceof GatewayError) {
      return fail(error.status, error.code, error.message, requestId);
    }
    if (error && error.message === 'ORIGIN_MISMATCH') {
      return fail(403, 'ORIGIN_MISMATCH', 'The request origin is not allowed.', requestId);
    }
    const failure = publicAdapterFailure(error);
    console.error('[api-gateway] ' + requestId + ' ' + failure.code);
    return fail(failure.status, failure.code, failure.message, requestId);
  }
}
