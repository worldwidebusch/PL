import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { handler as whatsappChallenge } from '../netlify/functions/whatsapp-challenge.mjs';

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

function loginEvent(body) {
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

test('email login requires credentials before starting mandatory WhatsApp verification', async () => {
  await environment({ PROLINKER_APP_ORIGIN: 'http://localhost:8888' }, async () => {
    const result = await whatsappChallenge(loginEvent({
      phone: '+31612345678',
      role: 'freelancer',
      intent: 'login',
      profile: { email: 'freelancer@example.test' }
    }));
    assert.equal(result.statusCode, 400);
    assert.equal(JSON.parse(result.body).error.code, 'CREDENTIALS_REQUIRED');
  });
});

test('email credentials are forwarded only to the private adapter before WhatsApp OTP delivery', async () => {
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
      PROLINKER_BACKEND_ADAPTER_URL: `http://127.0.0.1:${server.address().port}/adapter`,
      PROLINKER_BACKEND_ADAPTER_TOKEN: 'test-adapter-token'
    }, async () => {
      const result = await whatsappChallenge(loginEvent({
        phone: '+31612345678',
        role: 'client',
        intent: 'login',
        profile: { email: 'CLIENT@EXAMPLE.TEST', password: 'test-password' }
      }));
      assert.equal(result.statusCode, 202);
      assert.equal(received.operation, 'createOtpChallenge');
      assert.deepEqual(received.context.profile, { email: 'client@example.test' });
      assert.deepEqual(received.context.credentials, { password: 'test-password' });
      assert.equal(received.challenge.channel, 'whatsapp');
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('public login offers temporary direct role demo sessions while standard login remains email plus WhatsApp', async () => {
  const source = await readFile(new URL('../project/Prolinker Login.dc.html', import.meta.url), 'utf8');
  assert.match(source, /showTestLogin:\s*!isRegister/);
  assert.doesNotMatch(source, /if\s*\(!this\.isPreviewRuntime\(\)\)/);
  assert.match(source, /loginTestAccount\('freelancer'\)/);
  assert.match(source, /loginTestAccount\('client'\)/);
  assert.match(source, /channel:\s*'test'/);
  assert.match(source, /WhatsApp-verificatie is verplicht/);
});
