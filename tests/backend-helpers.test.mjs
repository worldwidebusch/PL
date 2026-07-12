import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appOrigin,
  sanitizeNextPath,
  sanitizeReferralTarget
} from '../netlify/functions/_lib/config.mjs';
import { serializeCookie } from '../netlify/functions/_lib/cookies.mjs';
import { assertSameOrigin, json } from '../netlify/functions/_lib/http.mjs';
import { openOpaqueToken, sealOpaqueToken } from '../netlify/functions/_lib/opaque-token.mjs';
import { signToken, verifyToken } from '../netlify/functions/_lib/signed-token.mjs';

const TEST_ORIGIN = 'https://prolinker.test';
const TEST_SECRET = '0123456789abcdef0123456789abcdef';

function event(headers = {}) {
  return {
    headers: {
      host: 'prolinker.test',
      'x-forwarded-proto': 'https',
      ...headers
    }
  };
}

function withEnvironment(callback) {
  const previousOrigin = process.env.PROLINKER_APP_ORIGIN;
  const previousSecret = process.env.PROLINKER_SESSION_SECRET;
  process.env.PROLINKER_APP_ORIGIN = TEST_ORIGIN;
  process.env.PROLINKER_SESSION_SECRET = TEST_SECRET;
  try {
    return callback();
  } finally {
    if (previousOrigin === undefined) delete process.env.PROLINKER_APP_ORIGIN;
    else process.env.PROLINKER_APP_ORIGIN = previousOrigin;
    if (previousSecret === undefined) delete process.env.PROLINKER_SESSION_SECRET;
    else process.env.PROLINKER_SESSION_SECRET = previousSecret;
  }
}

test('application origin and same-origin protection fail closed for another origin', () => withEnvironment(() => {
  assert.equal(appOrigin(event()), TEST_ORIGIN);
  assert.doesNotThrow(() => assertSameOrigin(event({ origin: TEST_ORIGIN })));
  assert.throws(() => assertSameOrigin(event({ origin: 'https://attacker.test' })), /ORIGIN_MISMATCH/);
  assert.throws(() => assertSameOrigin(event()), /ORIGIN_MISMATCH/);
}));

test('navigation and referral targets stay on allowlisted application pages', () => withEnvironment(() => {
  assert.equal(
    sanitizeNextPath('Prolinker Profiel.dc.html?tab=cv', 'freelancer', 'login'),
    '/project/Prolinker%20Profiel.dc.html?tab=cv'
  );
  assert.equal(
    sanitizeNextPath('https://attacker.test/steal', 'client', 'login'),
    '/project/Prolinker%20Dashboard.dc.html'
  );
  assert.equal(
    sanitizeReferralTarget('/project/Prolinker%20Voor%20jou%20v2.dc.html?job=job-1&ref=bad', event()),
    '/project/Prolinker%20Voor%20jou%20v2.dc.html?job=job-1'
  );
  assert.equal(sanitizeReferralTarget('https://attacker.test/project', event()), '');
}));

test('cookies and JSON responses carry the expected security controls', () => {
  const cookie = serializeCookie('plk_session', 'token', { path: '/', maxAge: 60 });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);

  const result = json(200, { ok: true });
  assert.equal(result.headers['Cache-Control'], 'no-store, max-age=0');
  assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(result.headers['X-Frame-Options'], 'DENY');
  assert.match(result.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
});

test('signed and opaque tokens reject tampering and expired payloads', () => withEnvironment(() => {
  const now = Math.floor(Date.now() / 1000);
  const signed = signToken({ typ: 'test', iat: now, exp: now + 60, value: 'ok' }, TEST_SECRET);
  assert.equal(verifyToken(signed, [TEST_SECRET], 'test').value, 'ok');
  assert.throws(() => verifyToken(signed + 'x', [TEST_SECRET], 'test'), /INVALID_TOKEN_SIGNATURE/);

  const opaque = sealOpaqueToken({ typ: 'share', iat: now, exp: now + 60, value: 'hidden' }, 'test-share');
  assert.equal(openOpaqueToken(opaque, 'test-share', 'share').value, 'hidden');
  assert.throws(() => openOpaqueToken(opaque.slice(0, -1) + 'x', 'test-share', 'share'), /INVALID_OPAQUE_TOKEN/);

  const expired = signToken({ typ: 'test', iat: now - 120, exp: now - 60 }, TEST_SECRET);
  assert.throws(() => verifyToken(expired, [TEST_SECRET], 'test'), /TOKEN_EXPIRED/);
}));
