import { appOrigin, sanitizeReferralTarget } from './_lib/config.mjs';
import {
  assertSameOrigin,
  json,
  methodNotAllowed,
  parseJsonBody,
  safeErrorCode
} from './_lib/http.mjs';
import { recordReferralOperation } from './_lib/referral-adapter.mjs';
import {
  createShareToken,
  sanitizeCampaign,
  sanitizeChannel,
  sanitizeEntityId,
  sanitizeEntityType
} from './_lib/referrals.mjs';
import { readSession } from './_lib/session.mjs';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  try {
    assertSameOrigin(event);
    const session = readSession(event);
    if (!session) return json(401, { error: { code: 'AUTH_REQUIRED', message: 'Log in before creating a referral link.' } });
    const body = parseJsonBody(event);
    const target = sanitizeReferralTarget(body.targetUrl || body.target, event);
    if (!target) return json(400, { error: { code: 'TARGET_INVALID', message: 'Choose a valid ProLinker page to share.' } });

    const rawEntityId = String(body.entityId || '').trim();
    const entityId = sanitizeEntityId(rawEntityId);
    if (rawEntityId && !entityId) return json(400, { error: { code: 'ENTITY_ID_INVALID', message: 'The shared item ID is invalid.' } });
    const entityType = sanitizeEntityType(body.entityType);
    const channel = sanitizeChannel(body.channel);
    const campaign = sanitizeCampaign(body.campaign);
    const created = createShareToken({
      referrerUserId: session.user.id,
      target,
      entityType,
      entityId,
      channel,
      campaign
    });

    const adapter = await recordReferralOperation('createReferralLink', {
      referrerUserId: session.user.id,
      share: {
        shareId: created.share.shareId,
        entityType,
        entityId,
        target,
        channel,
        campaign,
        createdAt: new Date(created.share.iat * 1000).toISOString(),
        expiresAt: new Date(created.share.exp * 1000).toISOString()
      }
    });

    const url = appOrigin(event) + '/r/' + encodeURIComponent(created.token);
    return json(201, {
      url,
      shareUrl: url,
      shareId: created.share.shareId,
      entityType,
      entityId,
      channel,
      campaign,
      expiresAt: new Date(created.share.exp * 1000).toISOString(),
      tracked: adapter.tracked,
      storageMode: adapter.storageMode,
      rewardStatus: 'not_calculated'
    });
  } catch (error) {
    const code = safeErrorCode(error);
    const status = code === 'ORIGIN_MISMATCH' ? 403
      : (code === 'INVALID_JSON' || code === 'REQUEST_TOO_LARGE' ? 400 : 502);
    console.error('[referral-links] ' + code);
    return json(status, {
      error: {
        code,
        message: status === 403 ? 'The request origin is not allowed.' : 'The referral link could not be created.'
      }
    });
  }
}

