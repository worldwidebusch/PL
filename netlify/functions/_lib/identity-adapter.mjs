import { createHmac } from 'node:crypto';
import { identityAdapterConfig, signingSecrets } from './config.mjs';
import { normalizeUser } from './session.mjs';

function adapterError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function callAdapter(operation, payload) {
  const config = identityAdapterConfig();
  if (!config) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + config.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ version: 1, operation, ...payload }),
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (error) {}
    if (!response.ok || !data.user) throw adapterError('IDENTITY_ADAPTER_FAILED', 'The identity adapter rejected the request.');
    return normalizeUser(data.user, payload.context && payload.context.role);
  } finally {
    clearTimeout(timeout);
  }
}

function previewUserId(subject) {
  return 'usr_' + createHmac('sha256', signingSecrets()[0])
    .update('linkedin:' + subject)
    .digest('base64url')
    .slice(0, 24);
}

function previewUser(profile, context, existingSession) {
  const existing = existingSession && existingSession.user ? existingSession.user : null;
  if (context.intent === 'import' && existing) {
    return normalizeUser({
      ...existing,
      firstName: existing.firstName || profile.firstName,
      lastName: existing.lastName || profile.lastName,
      displayName: existing.displayName || profile.displayName,
      email: existing.email || profile.email,
      emailVerified: existing.emailVerified === true || profile.emailVerified === true,
      avatarUrl: existing.avatarUrl || profile.avatarUrl,
      locale: existing.locale || profile.locale
    }, existing.role);
  }
  return normalizeUser({
    id: previewUserId(profile.subject),
    role: context.role,
    displayName: profile.displayName,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
    emailVerified: profile.emailVerified,
    avatarUrl: profile.avatarUrl,
    locale: profile.locale
  }, context.role);
}

export async function upsertLinkedInIdentity(profile, context, existingSession) {
  const adapterUser = await callAdapter('upsertLinkedInIdentity', {
    identity: {
      provider: 'linkedin',
      providerSubject: profile.subject,
      profile: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        displayName: profile.displayName,
        email: profile.email,
        emailVerified: profile.emailVerified,
        avatarUrl: profile.avatarUrl,
        locale: profile.locale,
        importedAt: profile.importedAt
      }
    },
    context: {
      intent: context.intent,
      role: context.role,
      referralCode: context.referralCode || '',
      existingUserId: existingSession && existingSession.user ? existingSession.user.id : ''
    }
  });
  return {
    user: adapterUser || previewUser(profile, context, existingSession),
    storageMode: adapterUser ? 'external-adapter' : 'signed-cookie-preview'
  };
}

function selectedValue(fields, field, profile, existing) {
  return fields.includes(field) && profile[field] ? profile[field] : existing[field];
}

export async function applyLinkedInProfile(session, fields) {
  const profile = session.linkedinProfile;
  const adapterUser = await callAdapter('applyLinkedInProfile', {
    userId: session.user.id,
    fields,
    profile,
    context: { role: session.user.role }
  });
  if (adapterUser) return { user: adapterUser, storageMode: 'external-adapter' };
  const existing = session.user;
  return {
    user: normalizeUser({
      ...existing,
      firstName: selectedValue(fields, 'firstName', profile, existing),
      lastName: selectedValue(fields, 'lastName', profile, existing),
      displayName: selectedValue(fields, 'displayName', profile, existing),
      email: profile.emailVerified ? selectedValue(fields, 'email', profile, existing) : existing.email,
      emailVerified: fields.includes('email') && profile.emailVerified ? true : existing.emailVerified,
      avatarUrl: selectedValue(fields, 'avatarUrl', profile, existing),
      locale: selectedValue(fields, 'locale', profile, existing)
    }, existing.role),
    storageMode: 'signed-cookie-preview'
  };
}

export function adapterEnabled() {
  return !!identityAdapterConfig();
}

