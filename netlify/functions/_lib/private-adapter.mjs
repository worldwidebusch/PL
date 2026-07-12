import { randomUUID } from 'node:crypto';
import { adapterTimeoutMs, backendAdapterConfig } from './config.mjs';

const MAX_ADAPTER_RESPONSE_BYTES = 2 * 1024 * 1024;

function adapterError(code, message, status = 502, retryable = false) {
  const error = new Error(message || code || 'Adapter request failed.');
  error.code = /^[A-Z0-9_]{3,64}$/.test(String(code || '')) ? code : 'BACKEND_ADAPTER_FAILED';
  error.status = Number(status) || 502;
  error.retryable = retryable === true;
  return error;
}

function responseError(data, response) {
  const source = data && typeof data === 'object' && data.error && typeof data.error === 'object' ? data.error : {};
  const code = source.code || data.code || 'BACKEND_ADAPTER_FAILED';
  const message = source.message || data.message || 'The backend adapter rejected the request.';
  return adapterError(code, message, response.status, response.status === 429 || response.status >= 500);
}

function parseAdapterPayload(text) {
  if (!text) return {};
  try { return JSON.parse(text); }
  catch (error) { throw adapterError('BACKEND_ADAPTER_INVALID_RESPONSE', 'The backend adapter returned invalid JSON.'); }
}

export async function callPrivateAdapter(operation, payload = {}, options = {}) {
  const config = backendAdapterConfig();
  if (!config) throw adapterError('BACKEND_ADAPTER_NOT_CONFIGURED', 'The backend adapter is not configured.', 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), adapterTimeoutMs());
  const requestId = String(options.requestId || randomUUID()).slice(0, 160);
  const startedAt = Date.now();
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + config.token,
        'Content-Type': 'application/json',
        'X-ProLinker-Request-Id': requestId
      },
      body: JSON.stringify({ version: 1, operation, requestId, ...payload }),
      signal: controller.signal
    });
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_ADAPTER_RESPONSE_BYTES) {
      throw adapterError('BACKEND_ADAPTER_RESPONSE_TOO_LARGE', 'The backend adapter response is too large.');
    }
    const data = parseAdapterPayload(text);
    if (!response.ok || (data && data.ok === false)) throw responseError(data, response);
    return {
      data: data && Object.prototype.hasOwnProperty.call(data, 'data') ? data.data
        : (data && Object.prototype.hasOwnProperty.call(data, 'result') ? data.result : data),
      status: Number(data && data.status) || response.status,
      requestId,
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error && error.name === 'AbortError') throw adapterError('BACKEND_ADAPTER_TIMEOUT', 'The backend adapter timed out.', 504, true);
    if (error && error.code) throw error;
    throw adapterError('BACKEND_ADAPTER_UNAVAILABLE', 'The backend adapter is unavailable.', 502, true);
  } finally {
    clearTimeout(timeout);
  }
}

export function adapterErrorResponse(error) {
  const status = Number(error && error.status);
  return {
    status: status >= 400 && status <= 599 ? status : 502,
    code: error && /^[A-Z0-9_]{3,64}$/.test(String(error.code || '')) ? error.code : 'BACKEND_ADAPTER_FAILED',
    message: error && error.message ? String(error.message).slice(0, 300) : 'The backend request failed.',
    retryable: !!(error && error.retryable)
  };
}
