import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { readOAuthTransaction } from '../netlify/functions/_lib/session.mjs';
import { handler as linkedinStart } from '../netlify/functions/linkedin-start.mjs';
import { handler as whatsappChallenge } from '../netlify/functions/whatsapp-challenge.mjs';

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

function registrationEvent(body) {
  return {
    httpMethod: 'POST',
    headers: {
      host: 'localhost:8888',
      origin: 'http://localhost:8888',
      'content-type': 'application/json',
      'x-forwarded-proto': 'http'
    },
    body: JSON.stringify(body)
  };
}

test('OAuth registration keeps sanitized profile and versioned consent in its signed transaction', async () => {
  await environment({
    PROLINKER_APP_ORIGIN: 'http://localhost:8888',
    PROLINKER_SESSION_SECRET: SECRET,
    PROLINKER_ALLOW_INSECURE_COOKIES: 'true',
    PROLINKER_TERMS_VERSION: '2026-07-12',
    PROLINKER_PRIVACY_VERSION: '2026-07-12',
    LINKEDIN_CLIENT_ID: 'test-client',
    LINKEDIN_CLIENT_SECRET: 'test-secret',
    LINKEDIN_REDIRECT_URI: 'http://localhost:8888/api/v1/auth/linkedin/callback'
  }, async () => {
    const result = await linkedinStart(registrationEvent({
      mode: 'register',
      role: 'freelancer',
      next: 'Prolinker Voor jou v2.dc.html',
      profile: {
        firstName: 'Ava',
        lastName: 'Tester',
        email: 'AVA@example.test',
        category: 'Development',
        password: 'must-not-enter-oauth'
      },
      consent: { accepted: true }
    }));
    assert.equal(result.statusCode, 200);
    assert.match(JSON.parse(result.body).authorizationUrl, /^https:\/\/www\.linkedin\.com\//);
    const cookie = result.multiValueHeaders['Set-Cookie'][0].split(';')[0];
    const transaction = readOAuthTransaction({ headers: { cookie } });
    assert.equal(transaction.registrationProfile.email, 'ava@example.test');
    assert.equal(transaction.registrationConsent.termsVersion, '2026-07-12');
    assert.equal(transaction.registrationConsent.privacyVersion, '2026-07-12');
    assert.equal(JSON.stringify(transaction).includes('must-not-enter-oauth'), false);
  });
});

test('WhatsApp registration forwards profile, credential and consent only to the private adapter', async () => {
  let received = null;
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received = JSON.parse(body);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 202, data: { accepted: true } }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await environment({
      PROLINKER_APP_ORIGIN: 'http://localhost:8888',
      PROLINKER_SESSION_SECRET: SECRET,
      PROLINKER_BACKEND_ADAPTER_URL: `http://127.0.0.1:${server.address().port}/adapter`,
      PROLINKER_BACKEND_ADAPTER_TOKEN: 'test-adapter-token',
      PROLINKER_TERMS_VERSION: '2026-07-12',
      PROLINKER_PRIVACY_VERSION: '2026-07-12'
    }, async () => {
      const result = await whatsappChallenge(registrationEvent({
        phone: '06 12345678',
        country: 'NL',
        role: 'freelancer',
        intent: 'register',
        profile: {
          firstName: 'Ava',
          lastName: 'Tester',
          email: 'ava@example.test',
          category: 'Development',
          password: 'temporary-password'
        },
        consent: { accepted: true }
      }));
      assert.equal(result.statusCode, 202);
      assert.equal(received.operation, 'createOtpChallenge');
      assert.equal(received.challenge.phone, '+31612345678');
      assert.equal(received.context.profile.firstName, 'Ava');
      assert.equal(received.context.credentials.password, 'temporary-password');
      assert.equal(received.context.consent.termsVersion, '2026-07-12');
      assert.equal(received.context.consent.privacyVersion, '2026-07-12');
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
