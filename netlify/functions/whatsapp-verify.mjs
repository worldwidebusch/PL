import { sanitizeReferralCode } from './_lib/config.mjs';
import {
  assertSameOrigin,
  json,
  methodNotAllowed,
  parseJsonBody,
  safeErrorCode,
  withCookies
} from './_lib/http.mjs';
import { adapterErrorResponse, callPrivateAdapter } from './_lib/private-adapter.mjs';
import { clearAttributionCookie } from './_lib/referrals.mjs';
import { createSessionPayload, issueSessionCookie, publicSession as sessionView } from './_lib/session.mjs';

function cleanText(value, maximum) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum);
}

function requestContext(event) {
  const headers = event && event.headers && typeof event.headers === 'object' ? event.headers : {};
  const find = (name) => {
    const key = Object.keys(headers).find((item) => item.toLowerCase() === name);
    return key ? cleanText(headers[key], 500) : '';
  };
  const forwarded = find('x-nf-client-connection-ip') || find('x-forwarded-for').split(',')[0].trim();
  const sourceIp = cleanText(event && event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp, 80);
  return {
    clientIp: forwarded || sourceIp,
    userAgent: find('user-agent'),
    verifiedAt: new Date().toISOString()
  };
}

function validationError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}

function failure(error) {
  const code = safeErrorCode(error);
  if (code === 'ORIGIN_MISMATCH') {
    return json(403, { error: { code, message: 'The request origin is not allowed.' } });
  }
  if (code === 'INVALID_JSON' || code === 'REQUEST_TOO_LARGE' || code === 'CHALLENGE_INVALID' || code === 'OTP_INVALID') {
    return json(400, { error: { code, message: error.message || 'The verification request is invalid.' } });
  }
  const adapter = adapterErrorResponse(error);
  if (adapter.status === 429) {
    return json(429, { error: { code: 'OTP_RATE_LIMITED', message: 'Too many verification attempts. Request a new code later.', retryable: true } });
  }
  if (adapter.status >= 400 && adapter.status < 500) {
    return json(400, { error: { code: 'OTP_INVALID_OR_EXPIRED', message: 'The verification code is invalid or has expired.' } });
  }
  return json(adapter.status, {
    error: { code: 'OTP_UNAVAILABLE', message: 'WhatsApp verification is temporarily unavailable.', retryable: adapter.retryable }
  });
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  try {
    assertSameOrigin(event);
    const body = parseJsonBody(event, 2048);
    const challengeId = cleanText(body.challengeId || body.id, 160);
    const code = String(body.code || '').trim();
    if (!/^[A-Za-z0-9_-]{16,160}$/.test(challengeId)) {
      throw validationError('CHALLENGE_INVALID', 'Start WhatsApp verification again.');
    }
    if (!/^\d{6}$/.test(code)) throw validationError('OTP_INVALID', 'Enter the six-digit verification code.');

    const verified = await callPrivateAdapter('verifyOtpChallenge', {
      challenge: { id: challengeId, code },
      context: requestContext(event)
    });
    const data = verified.data && typeof verified.data === 'object' ? verified.data : {};
    if (!data.user || typeof data.user !== 'object') {
      const error = new Error('The adapter did not return a durable user.');
      error.code = 'OTP_ADAPTER_INVALID_RESPONSE';
      error.status = 502;
      throw error;
    }
    const providers = Array.from(new Set((Array.isArray(data.providers) ? data.providers : []).concat('whatsapp')));
    const referralCode = sanitizeReferralCode(
      data.referralCode || (data.challenge && data.challenge.referralCode) || ''
    );
    const session = createSessionPayload({
      user: data.user,
      role: data.user.role,
      provider: 'whatsapp',
      providers,
      phoneVerified: true,
      referralCode,
      storageMode: 'external-adapter'
    });
    const cookies = [await issueSessionCookie(session, event)];
    if (data.referralAttributed === true) cookies.push(clearAttributionCookie(event));
    return withCookies(json(200, {
      ok: true,
      session: sessionView(session)
    }, { Vary: 'Cookie' }), cookies);
  } catch (error) {
    console.error('[whatsapp-verify] ' + safeErrorCode(error));
    return failure(error);
  }
}
