import {
  assertSameOrigin,
  json,
  methodNotAllowed,
  parseJsonBody,
  safeErrorCode
} from './_lib/http.mjs';
import { recordReferralOperation } from './_lib/referral-adapter.mjs';
import { sanitizeChannel, sanitizeReferralEvent } from './_lib/referrals.mjs';
import { readSession } from './_lib/session.mjs';

const FORBIDDEN_REWARD_FIELDS = Object.freeze([
  'amount',
  'currency',
  'grossValue',
  'payment',
  'reward',
  'rewardAmount',
  'rewardRate',
  'settled',
  'settlement',
  'transactionId'
]);

export async function handler(event) {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  try {
    assertSameOrigin(event);
    const session = readSession(event);
    if (!session) return json(401, { error: { code: 'AUTH_REQUIRED', message: 'Log in before recording a referral event.' } });
    const body = parseJsonBody(event);
    if (FORBIDDEN_REWARD_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
      return json(400, {
        error: {
          code: 'REWARD_CLAIM_NOT_ALLOWED',
          message: 'Referral activity cannot create a reward or payment claim.'
        }
      });
    }
    const eventName = sanitizeReferralEvent(body.event);
    if (!eventName) return json(400, { error: { code: 'EVENT_INVALID', message: 'The referral event is not allowed.' } });
    const shareId = String(body.shareId || '').trim();
    if (!/^shr_[A-Za-z0-9_-]{12,80}$/.test(shareId)) {
      return json(400, { error: { code: 'SHARE_ID_INVALID', message: 'The referral share ID is invalid.' } });
    }
    const channel = sanitizeChannel(body.channel);
    const adapter = await recordReferralOperation('recordReferralEvent', {
      actorUserId: session.user.id,
      event: {
        name: eventName,
        shareId,
        channel,
        occurredAt: new Date().toISOString()
      }
    });
    return json(200, {
      ok: true,
      event: eventName,
      shareId,
      tracked: adapter.tracked,
      storageMode: adapter.storageMode,
      rewardStatus: 'not_calculated'
    });
  } catch (error) {
    const code = safeErrorCode(error);
    const status = code === 'ORIGIN_MISMATCH' ? 403
      : (code === 'INVALID_JSON' || code === 'REQUEST_TOO_LARGE' ? 400 : 502);
    console.error('[referral-events] ' + code);
    return json(status, {
      error: {
        code,
        message: status === 403 ? 'The request origin is not allowed.' : 'The referral event could not be recorded.'
      }
    });
  }
}

