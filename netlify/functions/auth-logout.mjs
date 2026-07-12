import { assertSameOrigin, json, methodNotAllowed, safeErrorCode, withCookies } from './_lib/http.mjs';
import { clearOAuthCookie, clearSessionCookie } from './_lib/session.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  try {
    assertSameOrigin(event);
    return withCookies(json(200, { ok: true, authenticated: false }), [
      clearSessionCookie(event),
      clearOAuthCookie(event)
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

