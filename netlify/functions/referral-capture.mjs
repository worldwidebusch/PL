import { sanitizeReferralTarget } from './_lib/config.mjs';
import { queryParameters, redirect, withCookies } from './_lib/http.mjs';
import { recordReferralOperation } from './_lib/referral-adapter.mjs';
import {
  attributionCookie,
  createAttribution,
  readReferralAttribution,
  readShareToken
} from './_lib/referrals.mjs';
import { readSession } from './_lib/session.mjs';

const INVALID_LINK_TARGET = '/project/Prolinker%20Homepage.dc.html?referral=invalid';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return redirect(INVALID_LINK_TARGET);
  try {
    const token = String(queryParameters(event).get('token') || '');
    const share = readShareToken(token);
    const target = sanitizeReferralTarget(share.target, event);
    if (!target) return redirect(INVALID_LINK_TARGET);

    const session = readSession(event);
    const currentUserId = session && session.user ? session.user.id : '';
    const selfAttributionIgnored = !!currentUserId && currentUserId === share.referrerUserId;
    const existingAttribution = readReferralAttribution(event);
    const shouldStoreAttribution = !selfAttributionIgnored && !existingAttribution;
    const attribution = shouldStoreAttribution ? createAttribution(share) : existingAttribution;

    await recordReferralOperation('recordReferralCapture', {
      shareId: share.shareId,
      referrerUserId: share.referrerUserId,
      actorUserId: currentUserId,
      entityType: share.entityType,
      entityId: share.entityId,
      capturedAt: new Date().toISOString(),
      attributionStored: shouldStoreAttribution,
      firstTouchPreserved: !!existingAttribution,
      selfAttributionIgnored
    }, { bestEffort: true });

    const result = redirect(target, 302, { 'X-Robots-Tag': 'noindex, nofollow' });
    return shouldStoreAttribution ? withCookies(result, attributionCookie(attribution, event)) : result;
  } catch (error) {
    console.error('[referral-capture] INVALID_OR_EXPIRED_LINK');
    return redirect(INVALID_LINK_TARGET, 302, { 'X-Robots-Tag': 'noindex, nofollow' });
  }
}

