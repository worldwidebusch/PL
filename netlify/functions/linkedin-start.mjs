import {
  sanitizeIntent,
  sanitizeNextPath,
  sanitizeReferralCode,
  sanitizeRole
} from './_lib/config.mjs';
import { json, methodNotAllowed, queryParameters, redirect, withCookies } from './_lib/http.mjs';
import { linkedinAuthorizationUrl } from './_lib/linkedin-oidc.mjs';
import { createOAuthTransaction, readSession } from './_lib/session.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  try {
    const query = queryParameters(event);
    const intent = sanitizeIntent(query.get('intent') || query.get('mode')) || 'login';
    const existingSession = intent === 'import' ? readSession(event) : null;
    if (intent === 'import' && !existingSession) {
      return json(401, { error: { code: 'AUTH_REQUIRED', message: 'Log in before importing a LinkedIn profile.' } });
    }
    const role = existingSession ? existingSession.user.role : sanitizeRole(query.get('role'));
    if (!role) {
      return json(400, { error: { code: 'ROLE_REQUIRED', message: 'Choose a client or freelancer account.' } });
    }
    const next = sanitizeNextPath(query.get('next'), role, intent);
    const referralCode = sanitizeReferralCode(query.get('ref'));
    const created = createOAuthTransaction({
      intent,
      role,
      next,
      referralCode,
      existingUserId: existingSession && existingSession.user ? existingSession.user.id : ''
    }, event);
    const location = linkedinAuthorizationUrl(created.transaction, event);
    return withCookies(redirect(location), created.cookie);
  } catch (error) {
    console.error('[linkedin-start] CONFIGURATION_ERROR');
    return json(503, {
      error: {
        code: 'AUTH_CONFIGURATION_ERROR',
        message: 'LinkedIn login is not configured yet.'
      }
    });
  }
}

