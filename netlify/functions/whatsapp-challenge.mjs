import { randomUUID } from 'node:crypto';
import {
  otpMaxAttempts,
  otpResendSeconds,
  otpTtlSeconds,
  sanitizeIntent,
  sanitizeNextPath,
  sanitizeReferralCode,
  sanitizeRole
} from './_lib/config.mjs';
import {
  assertSameOrigin,
  json,
  methodNotAllowed,
  parseJsonBody,
  safeErrorCode
} from './_lib/http.mjs';
import { maskPhone, normalizePhoneE164 } from './_lib/phone.mjs';
import { adapterErrorResponse, callPrivateAdapter } from './_lib/private-adapter.mjs';
import { readReferralAttribution } from './_lib/referrals.mjs';
import { registrationConsent, registrationCredentials, registrationProfile } from './_lib/registration.mjs';

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
    requestedAt: new Date().toISOString()
  };
}

function genericAccepted(challengeId, phone) {
  return json(202, {
    ok: true,
    challengeId,
    channel: 'whatsapp',
    destination: maskPhone(phone),
    expiresIn: otpTtlSeconds(),
    resendAfter: otpResendSeconds(),
    message: 'If this number can be used, a verification code will arrive shortly.'
  });
}

function failure(error) {
  const code = safeErrorCode(error);
  if (code === 'ORIGIN_MISMATCH') {
    return json(403, { error: { code, message: 'The request origin is not allowed.' } });
  }
  if (code === 'INVALID_JSON' || code === 'REQUEST_TOO_LARGE' || code === 'PHONE_INVALID' || code === 'PHONE_COUNTRY_REQUIRED') {
    return json(400, { error: { code, message: error.message || 'The request is invalid.' } });
  }
  const adapter = adapterErrorResponse(error);
  if (adapter.status === 429) {
    return json(429, { error: { code: 'OTP_RATE_LIMITED', message: 'Please wait before requesting another code.', retryable: true } });
  }
  return json(adapter.status >= 500 ? adapter.status : 503, {
    error: { code: 'OTP_UNAVAILABLE', message: 'WhatsApp verification is temporarily unavailable.', retryable: adapter.retryable }
  });
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  let phone = '';
  let challengeId = '';
  try {
    assertSameOrigin(event);
    const body = parseJsonBody(event, 4096);
    const role = sanitizeRole(body.role);
    const intent = sanitizeIntent(body.intent || body.mode);
    if (!role) return json(400, { error: { code: 'ROLE_REQUIRED', message: 'Choose a client or freelancer account.' } });
    if (intent !== 'login' && intent !== 'register') {
      return json(400, { error: { code: 'INTENT_INVALID', message: 'Choose login or registration.' } });
    }
    phone = normalizePhoneE164(body.phone || body.phoneNumber || body.contact, body.country || body.countryCode || body.region);
    challengeId = randomUUID();
    const referralCode = sanitizeReferralCode(body.ref || body.referralCode);
    const attribution = intent === 'register' ? readReferralAttribution(event) : null;
    const consent = intent === 'register' ? registrationConsent(body.consent) : null;
    if (intent === 'register' && !consent) return json(400, { error: { code: 'CONSENT_REQUIRED', message: 'Accept the terms and privacy policy to register.' } });
    await callPrivateAdapter('createOtpChallenge', {
      challenge: {
        id: challengeId,
        channel: 'whatsapp',
        phone,
        intent,
        role,
        locale: cleanText(body.locale, 35),
        ttlSeconds: otpTtlSeconds(),
        resendAfterSeconds: otpResendSeconds(),
        maxAttempts: otpMaxAttempts()
      },
      context: {
        next: sanitizeNextPath(body.next, role, intent),
        referralCode,
        referralAttribution: attribution ? {
          referrerUserId: attribution.referrerUserId,
          shareId: attribution.shareId,
          entityType: attribution.entityType,
          entityId: attribution.entityId,
          capturedAt: attribution.capturedAt
        } : null,
        profile: intent === 'register' ? registrationProfile(body.profile || body) : {},
        credentials: intent === 'register' ? registrationCredentials(body.profile || body) : {},
        consent,
        ...requestContext(event)
      }
    });
    return genericAccepted(challengeId, phone);
  } catch (error) {
    const adapter = adapterErrorResponse(error);
    if (challengeId && phone && adapter.status >= 400 && adapter.status < 500 && adapter.status !== 429) {
      return genericAccepted(challengeId, phone);
    }
    console.error('[whatsapp-challenge] ' + safeErrorCode(error));
    return failure(error);
  }
}
