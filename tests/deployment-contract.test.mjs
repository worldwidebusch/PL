import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function text(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

function redirectSources(toml) {
  return Array.from(toml.matchAll(/\[\[redirects\]\][\s\S]*?\n\s*from\s*=\s*"([^"]+)"[\s\S]*?(?=\n\[\[|$)/g), (match) => match[1]);
}

test('Netlify builds a clean dist directory with Node 22', async () => {
  const toml = await text('netlify.toml');
  assert.match(toml, /command\s*=\s*"npm run build"/);
  assert.match(toml, /publish\s*=\s*"dist"/);
  assert.match(toml, /NODE_VERSION\s*=\s*"22"/);
});

test('exact API routes precede the final API gateway catchall', async () => {
  const toml = await text('netlify.toml');
  const sources = redirectSources(toml);
  const expectedExactRoutes = [
    '/api/v1/auth/linkedin/start',
    '/api/v1/auth/linkedin/callback',
    '/api/v1/auth/facebook/start',
    '/api/v1/auth/facebook/callback',
    '/api/v1/auth/session',
    '/api/v1/auth/logout',
    '/api/v1/auth/whatsapp/challenges',
    '/api/v1/auth/whatsapp/verify',
    '/api/v1/profile/imports/linkedin',
    '/api/v1/referrals/links',
    '/api/v1/referrals/events',
    '/r/:token'
  ];
  for (const route of expectedExactRoutes) assert.ok(sources.includes(route), 'Missing redirect: ' + route);
  assert.equal(sources.at(-1), '/api/v1/*');
  assert.ok(sources.indexOf('/api/v1/*') > sources.indexOf('/api/v1/referrals/events'));
  assert.match(toml, /from\s*=\s*"\/api\/v1\/auth\/whatsapp\/challenges"[\s\S]*?to\s*=\s*"\/\.netlify\/functions\/whatsapp-challenge"/);
  assert.match(toml, /from\s*=\s*"\/api\/v1\/auth\/whatsapp\/verify"[\s\S]*?to\s*=\s*"\/\.netlify\/functions\/whatsapp-verify"/);
  assert.match(toml, /from\s*=\s*"\/api\/v1\/auth\/facebook\/start"[\s\S]*?to\s*=\s*"\/\.netlify\/functions\/facebook-start"/);
  assert.match(toml, /from\s*=\s*"\/api\/v1\/auth\/facebook\/callback"[\s\S]*?to\s*=\s*"\/\.netlify\/functions\/facebook-callback"/);
});

test('static responses define baseline browser security headers', async () => {
  const toml = await text('netlify.toml');
  for (const header of [
    'Content-Security-Policy',
    'Referrer-Policy',
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Permissions-Policy'
  ]) assert.match(toml, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('environment template contains placeholders only for private credentials', async () => {
  const env = await text('.env.example');
  const entries = Object.fromEntries(env.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=');
      return [line.slice(0, separator), line.slice(separator + 1)];
    }));
  for (const key of [
    'LINKEDIN_CLIENT_SECRET',
    'FACEBOOK_CLIENT_SECRET',
    'PROLINKER_SESSION_SECRET',
    'PROLINKER_BACKEND_ADAPTER_TOKEN',
    'PROLINKER_IDENTITY_ADAPTER_TOKEN'
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(entries, key), 'Missing environment key: ' + key);
    assert.equal(entries[key], '', key + ' must not contain a committed value');
  }
  assert.equal(entries.PROLINKER_ALLOW_PREVIEW_AUTH, 'false');
  assert.match(entries.PROLINKER_TERMS_VERSION, /^\d{4}-\d{2}-\d{2}/);
  assert.match(entries.PROLINKER_PRIVACY_VERSION, /^\d{4}-\d{2}-\d{2}/);
});
