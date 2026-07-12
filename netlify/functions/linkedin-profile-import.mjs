import { applyLinkedInProfile } from './_lib/identity-adapter.mjs';
import {
  assertSameOrigin,
  json,
  methodNotAllowed,
  parseJsonBody,
  safeErrorCode,
  withCookies
} from './_lib/http.mjs';
import {
  createSessionPayload,
  publicSession,
  readSession,
  sessionCookie
} from './_lib/session.mjs';

const ALLOWED_FIELDS = Object.freeze(['firstName', 'lastName', 'displayName', 'email', 'avatarUrl', 'locale']);

function importView(session) {
  const profile = session.linkedinProfile;
  return {
    source: 'linkedin',
    importedAt: profile.importedAt || '',
    availableFields: ALLOWED_FIELDS.filter((field) => field !== 'email' || profile.emailVerified === true),
    profile: {
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      displayName: profile.displayName || '',
      email: profile.emailVerified ? profile.email || '' : '',
      emailVerified: profile.emailVerified === true,
      avatarUrl: profile.avatarUrl || '',
      locale: profile.locale || ''
    }
  };
}

export async function handler(event) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return methodNotAllowed(['GET', 'POST']);
  try {
    const session = readSession(event);
    if (!session) return json(401, { error: { code: 'AUTH_REQUIRED', message: 'Log in before importing a profile.' } });
    const providers = session.auth && Array.isArray(session.auth.providers) ? session.auth.providers : [];
    if (!providers.includes('linkedin') || !session.linkedinProfile) {
      return json(409, { error: { code: 'LINKEDIN_NOT_CONNECTED', message: 'Connect LinkedIn before importing profile fields.' } });
    }
    if (event.httpMethod === 'GET') return json(200, importView(session), { Vary: 'Cookie' });

    assertSameOrigin(event);
    const body = parseJsonBody(event);
    const requested = Array.isArray(body.fields) ? body.fields : ALLOWED_FIELDS;
    const fields = Array.from(new Set(requested.map((field) => String(field || '')).filter((field) => ALLOWED_FIELDS.includes(field))));
    if (!fields.length) return json(400, { error: { code: 'IMPORT_FIELDS_REQUIRED', message: 'Select at least one profile field.' } });
    if (!session.linkedinProfile.emailVerified) {
      const emailIndex = fields.indexOf('email');
      if (emailIndex >= 0) fields.splice(emailIndex, 1);
    }
    if (!fields.length) return json(400, { error: { code: 'IMPORT_FIELDS_REQUIRED', message: 'No selected field can be imported.' } });

    const applied = await applyLinkedInProfile(session, fields);
    const refreshed = createSessionPayload({
      user: applied.user,
      role: applied.user.role,
      provider: session.auth.provider,
      providers: session.auth.providers,
      phoneVerified: session.auth.phoneVerified,
      linkedinProfile: session.linkedinProfile,
      referralCode: session.referralCode,
      storageMode: applied.storageMode
    });
    return withCookies(json(200, {
      ok: true,
      importedFields: fields,
      session: publicSession(refreshed)
    }, { Vary: 'Cookie' }), sessionCookie(refreshed, event));
  } catch (error) {
    const code = safeErrorCode(error);
    const status = code === 'ORIGIN_MISMATCH' ? 403
      : (code === 'INVALID_JSON' || code === 'REQUEST_TOO_LARGE' ? 400 : 502);
    console.error('[linkedin-profile-import] ' + code);
    return json(status, {
      error: {
        code,
        message: status === 403 ? 'The request origin is not allowed.' : 'The LinkedIn profile could not be imported.'
      }
    });
  }
}

