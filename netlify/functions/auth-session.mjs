import { json, methodNotAllowed, withCookies } from './_lib/http.mjs';
import { clearSessionCookie, publicSession, readSession } from './_lib/session.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  try {
    const session = readSession(event);
    if (!session) {
      return withCookies(json(401, {
        authenticated: false,
        error: { code: 'AUTH_REQUIRED', message: 'No active session.' }
      }, { Vary: 'Cookie' }), clearSessionCookie(event));
    }
    return json(200, publicSession(session), { Vary: 'Cookie' });
  } catch (error) {
    return json(503, {
      authenticated: false,
      error: { code: 'AUTH_CONFIGURATION_ERROR', message: 'Authentication is not configured yet.' }
    });
  }
}

