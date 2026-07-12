import { assertSameOrigin, json, methodNotAllowed, safeErrorCode, withCookies } from './_lib/http.mjs';
import { clearAllOAuthCookies, clearSessionCookie, revokeSession } from './_lib/session.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  try {
    assertSameOrigin(event);
    let revocationFailed = false;
    try { await revokeSession(event); }
    catch (error) { revocationFailed = true; console.error('[auth-logout] SESSION_REVOCATION_FAILED'); }
    return withCookies(json(revocationFailed ? 503 : 200, revocationFailed
      ? { ok: false, authenticated: false, error: { code: 'SESSION_REVOCATION_FAILED', message: 'The browser session was cleared, but server revocation must be retried.' } }
      : { ok: true, authenticated: false }), [
      ...clearSessionCookie(event),
      ...clearAllOAuthCookies(event)
    ]);
  } catch (error) {
    const code = safeErrorCode(error);
    return json(code === 'ORIGIN_MISMATCH' ? 403 : 503, {
      error: {
        code,
        message: code === 'ORIGIN_MISMATCH' ? 'The request origin is not allowed.' : 'Logout is not configured yet.'
      }
    });
  }
}

