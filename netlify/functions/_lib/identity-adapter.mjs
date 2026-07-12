import { createHmac } from 'node:crypto';
import { allowPreviewAuth, identityAdapterConfig, signingSecrets } from './config.mjs';
import { callPrivateAdapter } from './private-adapter.mjs';
import { normalizeUser } from './session.mjs';

function adapterError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

async function callAdapter(operation, payload) {
  const config = identityAdapterConfig();
  if (!config) return null;
  const result = await callPrivateAdapter(operation, payload);
  const data = result.data && typeof result.data === 'object' ? result.data : {};
  if (!data.user) throw adapterError('IDENTITY_ADAPTER_FAILED', 'The identity adapter did not return a user.');
  return normalizeUser(data.user, payload.context && payload.context.role);
}

function previewUserId(provider, subject) {
  return 'usr_' + createHmac('sha256', signingSecrets()[0])
    .update(provider + ':' + subject)
    .digest('base64url')
    .slice(0, 24);
}

function previewUser(provider, profile, context, existingSession) {
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
  const registration = context.intent === 'register' && context.registrationProfile && typeof context.registrationProfile === 'object'
    ? context.registrationProfile
    : {};
  const providerEmailVerified = profile.emailVerified === true && !!profile.email;
  return normalizeUser({
    id: previewUserId(provider, profile.subject),
    role: context.role,
    displayName: registration.displayName || profile.displayName,
    firstName: registration.firstName || profile.firstName,
    lastName: registration.lastName || profile.lastName,
    email: providerEmailVerified ? profile.email : (registration.email || profile.email),
    emailVerified: providerEmailVerified,
    avatarUrl: profile.avatarUrl,
    locale: registration.locale || profile.locale
  }, context.role);
}

export async function upsertLinkedInIdentity(profile, context, existingSession) {
  return upsertExternalIdentity('linkedin', profile, context, existingSession);
}

export async function upsertExternalIdentity(provider, profile, context, existingSession) {
  if (provider !== 'linkedin' && provider !== 'facebook') throw adapterError('IDENTITY_PROVIDER_INVALID', 'The identity provider is not supported.');
  const operation = provider === 'linkedin' ? 'upsertLinkedInIdentity' : 'upsertSocialIdentity';
  const registration = context.intent === 'register'
    ? {
        registrationProfile: context.registrationProfile || null,
        registrationConsent: context.registrationConsent || null
      }
    : {};
  const adapterUser = await callAdapter(operation, {
    identity: {
      provider,
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
      existingUserId: existingSession && existingSession.user ? existingSession.user.id : '',
      ...registration
    }
  });
  if (!adapterUser && !allowPreviewAuth()) {
    throw adapterError('IDENTITY_ADAPTER_REQUIRED', 'A durable identity adapter is required.');
  }
  return {
    user: adapterUser || previewUser(provider, profile, context, existingSession),
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
  if (!allowPreviewAuth()) throw adapterError('IDENTITY_ADAPTER_REQUIRED', 'A durable identity adapter is required.');
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

