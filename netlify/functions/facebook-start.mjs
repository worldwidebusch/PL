import { eventHeader, sanitizeIntent, sanitizeNextPath, sanitizeReferralCode, sanitizeRole } from './_lib/config.mjs';
import { facebookAuthorizationUrl } from './_lib/facebook-oauth.mjs';
import {
  assertSameOrigin,
  json,
  methodNotAllowed,
  parseJsonBody,
  queryParameters,
  redirect,
  safeErrorCode,
  withCookies
} from './_lib/http.mjs';
import { registrationConsent, registrationProfile } from './_lib/registration.mjs';
import { createOAuthTransaction, readSession } from './_lib/session.mjs';

function validRegistrationProfile(profile, role) {
  if (!profile.firstName || !profile.lastName || !profile.email || !profile.category) return false;
  return role !== 'client' || !!profile.companyName;
}

function startFailure(error) {
  const code = safeErrorCode(error);
  if (code === 'ORIGIN_MISMATCH') {
    return json(403, { error: { code, message: 'The request origin is not allowed.' } });
  }
  if (code === 'REQUEST_TOO_LARGE' || code === 'INVALID_JSON' || error instanceof SyntaxError) {
    return json(400, { error: { code: code === 'REQUEST_FAILED' ? 'INVALID_JSON' : code, message: 'The registration request is invalid.' } });
  }
  console.error('[facebook-start] ' + code);
  return json(503, { error: { code: 'AUTH_CONFIGURATION_ERROR', message: 'Facebook login is not configured yet.' } });
}

export async function handler(event) {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') return methodNotAllowed(['GET', 'POST']);
  try {
    if (event.httpMethod === 'POST') {
      assertSameOrigin(event);
      if (!/^application\/json(?:\s*;|$)/i.test(eventHeader(event, 'content-type'))) {
        return json(415, { error: { code: 'CONTENT_TYPE_REQUIRED', message: 'Send registration data as JSON.' } });
      }
      const body = parseJsonBody(event, 8192);
      const intent = sanitizeIntent(body.intent || body.mode || 'register');
      if (intent !== 'register') {
        return json(400, { error: { code: 'INTENT_INVALID', message: 'POST is only available for registration.' } });
      }
      const role = sanitizeRole(body.role);
      if (!role) return json(400, { error: { code: 'ROLE_REQUIRED', message: 'Choose a client or freelancer account.' } });
      const profile = registrationProfile(body.registrationProfile || body.profile || body);
      if (!validRegistrationProfile(profile, role)) {
        return json(400, { error: { code: 'REGISTRATION_PROFILE_INVALID', message: 'Complete the required registration details.' } });
      }
      const consent = registrationConsent(body.registrationConsent || body.consent);
      if (!consent) {
        return json(400, { error: { code: 'CONSENT_REQUIRED', message: 'Accept the terms and privacy policy to register.' } });
      }
      const created = createOAuthTransaction({
        intent,
        role,
        next: sanitizeNextPath(body.next, role, intent),
        referralCode: sanitizeReferralCode(body.ref || body.referralCode),
        existingUserId: '',
        registrationProfile: profile,
        registrationConsent: consent
      }, event, 'facebook');
      const authorizationUrl = facebookAuthorizationUrl(created.transaction, event);
      return withCookies(json(200, { authorizationUrl, provider: 'facebook' }), created.cookie);
    }

    const query = queryParameters(event);
    const intent = sanitizeIntent(query.get('intent') || query.get('mode')) || 'login';
    if (intent === 'register') {
      return json(400, { error: { code: 'REGISTRATION_POST_REQUIRED', message: 'Submit registration details before continuing with Facebook.' } });
    }
    const existingSession = intent === 'import' ? await readSession(event) : null;
    if (intent === 'import' && !existingSession) {
      return json(401, { error: { code: 'AUTH_REQUIRED', message: 'Log in before linking Facebook.' } });
    }
    const role = existingSession ? existingSession.user.role : sanitizeRole(query.get('role'));
    if (!role) return json(400, { error: { code: 'ROLE_REQUIRED', message: 'Choose a client or freelancer account.' } });
    const next = sanitizeNextPath(query.get('next'), role, intent);
    const created = createOAuthTransaction({
      intent,
      role,
      next,
      referralCode: sanitizeReferralCode(query.get('ref')),
      existingUserId: existingSession && existingSession.user ? existingSession.user.id : ''
    }, event, 'facebook');
    return withCookies(redirect(facebookAuthorizationUrl(created.transaction, event)), created.cookie);
  } catch (error) {
    return startFailure(error);
  }
}
