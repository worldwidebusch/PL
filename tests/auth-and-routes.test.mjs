import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { handler as apiGateway } from '../netlify/functions/api-gateway.mjs';
import { normalizeApiPath, resolveApiRoute } from '../netlify/functions/_lib/api-route-contracts.mjs';
import { normalizeFacebookProfile } from '../netlify/functions/_lib/facebook-oauth.mjs';
import { normalizePhoneE164 } from '../netlify/functions/_lib/phone.mjs';
import {
  createSessionPayload,
  issueSessionCookie,
  publicSession,
  readSession
} from '../netlify/functions/_lib/session.mjs';

const SECRET = '0123456789abcdef0123456789abcdef';

function environment(values, callback) {
  const previous = {};
  Object.keys(values).forEach((key) => {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  });
  const restore = () => Object.keys(values).forEach((key) => {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  });
  try {
    const result = callback();
    if (result && typeof result.finally === 'function') return result.finally(restore);
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

function requestEvent(cookie = '') {
  return {
    headers: {
      host: 'localhost:8888',
      'x-forwarded-proto': 'http',
      cookie
    }
  };
}

test('phone normalization covers staging markets and rejects ambiguous local numbers', () => {
  assert.equal(normalizePhoneE164('06 12345678', 'NL'), '+31612345678');
  assert.equal(normalizePhoneE164('0470 12 34 56', 'BE'), '+32470123456');
  assert.equal(normalizePhoneE164('(202) 555-0123', 'US'), '+12025550123');
  assert.equal(normalizePhoneE164('0031 6 12345678'), '+31612345678');
  assert.throws(() => normalizePhoneE164('0612345678'), /country/i);
});

test('Netlify catchall path resolves to the strict operation contract', () => {
  const path = normalizeApiPath({
    path: '/.netlify/functions/api-gateway',
    queryStringParameters: { path: 'opportunities/job-42/saved' }
  });
  assert.equal(path, '/api/v1/opportunities/job-42/saved');
  const save = resolveApiRoute('PUT', path);
  assert.equal(save.contract.operation, 'saveOpportunity');
  assert.equal(save.params.id, 'job-42');
  assert.deepEqual(save.contract.roles, ['freelancer']);
});

test('Facebook profile normalization does not claim email verification', () => {
  const profile = normalizeFacebookProfile({
    id: 'fb-subject',
    first_name: 'Ava',
    last_name: 'Example',
    email: 'ava@example.test',
    picture: { data: { url: 'http://insecure.example/avatar.jpg' } }
  });
  assert.equal(profile.subject, 'fb-subject');
  assert.equal(profile.displayName, 'Ava Example');
  assert.equal(profile.emailVerified, false);
  assert.equal(profile.avatarUrl, '');
});

test('preview sessions are explicit and disabled by production context', async () => {
  await environment({
    PROLINKER_APP_ORIGIN: 'http://localhost:8888',
    PROLINKER_SESSION_SECRET: SECRET,
    PROLINKER_ALLOW_PREVIEW_AUTH: 'true',
    PROLINKER_ALLOW_INSECURE_COOKIES: 'true',
    PROLINKER_BACKEND_ADAPTER_URL: undefined,
    PROLINKER_IDENTITY_ADAPTER_URL: undefined,
    CONTEXT: 'dev'
  }, async () => {
    const payload = createSessionPayload({
      user: { id: 'usr_test', role: 'freelancer', displayName: 'Test Member' },
      role: 'freelancer',
      provider: 'whatsapp',
      providers: ['whatsapp'],
      phoneVerified: true
    });
    const cookie = await issueSessionCookie(payload, requestEvent());
    const pair = cookie.split(';')[0];
    const resolved = await readSession(requestEvent(pair));
    assert.equal(publicSession(resolved).user.id, 'usr_test');
    process.env.CONTEXT = 'production';
    assert.equal(await readSession(requestEvent(pair)), null);
  });
});

test('API catchall forwards only its allowlisted operation envelope', async () => {
  let received = null;
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received = JSON.parse(body);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 200, data: { items: [], total: 0, nextCursor: null } }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    await environment({
      PROLINKER_BACKEND_ADAPTER_URL: `http://127.0.0.1:${address.port}/adapter`,
      PROLINKER_BACKEND_ADAPTER_TOKEN: 'server-test-token',
      PROLINKER_IDENTITY_ADAPTER_URL: undefined,
      PROLINKER_IDENTITY_ADAPTER_TOKEN: undefined
    }, async () => {
      const response = await apiGateway({
        httpMethod: 'GET',
        path: '/.netlify/functions/api-gateway',
        queryStringParameters: { path: 'opportunities', limit: '5' },
        headers: { 'x-request-id': 'test-request' }
      });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(JSON.parse(response.body), { items: [], total: 0, nextCursor: null });
      assert.equal(received.operation, 'listOpportunities');
      assert.equal(received.requestId, 'test-request');
      assert.equal(received.query.limit, '5');
      assert.equal(Object.prototype.hasOwnProperty.call(received.query, 'path'), false);
      assert.equal(received.actor, null);
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
