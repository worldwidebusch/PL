import { randomBytes } from 'node:crypto';
import { referralLinkTtlSeconds, secureCookies } from './config.mjs';
import { clearCookie, parseCookies, serializeCookie } from './cookies.mjs';
import { openOpaqueToken, sealOpaqueToken } from './opaque-token.mjs';

export const ATTRIBUTION_COOKIE = 'plk_referral_attribution';
export const ATTRIBUTION_TTL_SECONDS = 30 * 24 * 60 * 60;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function cleanText(value, maximum) {
  return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maximum);
}

export function sanitizeEntityType(value) {
  const type = cleanText(value, 24).toLowerCase();
  return ['project', 'opportunity', 'profile', 'general'].includes(type) ? type : 'general';
}

export function sanitizeEntityId(value) {
  const id = cleanText(value, 160);
  return /^[A-Za-z0-9._:-]{1,160}$/.test(id) ? id : '';
}

export function sanitizeChannel(value) {
  const channel = cleanText(value, 40).toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(channel) ? channel : 'share-sheet';
}

export function sanitizeCampaign(value) {
  const campaign = cleanText(value, 80).toLowerCase();
  return /^[a-z0-9_-]{1,80}$/.test(campaign) ? campaign : 'member-share';
}

export function sanitizeReferralEvent(value) {
  const event = cleanText(value, 40).toLowerCase();
  return ['share_opened', 'share_selected', 'link_copied'].includes(event) ? event : '';
}

export function createShareToken(input) {
  const now = nowSeconds();
  const share = {
    typ: 'referral-share',
    v: 1,
    iat: now,
    exp: now + referralLinkTtlSeconds(),
    shareId: 'shr_' + randomBytes(18).toString('base64url'),
    referrerUserId: cleanText(input.referrerUserId, 160),
    target: input.target,
    entityType: sanitizeEntityType(input.entityType),
    entityId: sanitizeEntityId(input.entityId),
    channel: sanitizeChannel(input.channel),
    campaign: sanitizeCampaign(input.campaign)
  };
  if (!share.referrerUserId || !share.target) throw new Error('INVALID_REFERRAL_SHARE');
  return {
    share,
    token: sealOpaqueToken(share, 'referral-share')
  };
}

export function readShareToken(token) {
  return openOpaqueToken(token, 'referral-share', 'referral-share');
}

export function createAttribution(share) {
  const now = nowSeconds();
  return {
    typ: 'referral-attribution',
    v: 1,
    iat: now,
    exp: now + ATTRIBUTION_TTL_SECONDS,
    shareId: share.shareId,
    referrerUserId: share.referrerUserId,
    entityType: share.entityType,
    entityId: share.entityId,
    capturedAt: new Date(now * 1000).toISOString()
  };
}

function attributionCookieOptions(event, maxAge) {
  return {
    path: '/',
    maxAge,
    httpOnly: true,
    secure: secureCookies(event),
    sameSite: 'Lax'
  };
}

export function attributionCookie(attribution, event) {
  return serializeCookie(
    ATTRIBUTION_COOKIE,
    sealOpaqueToken(attribution, 'referral-attribution'),
    attributionCookieOptions(event, ATTRIBUTION_TTL_SECONDS)
  );
}

export function readReferralAttribution(event) {
  const token = parseCookies(event)[ATTRIBUTION_COOKIE];
  if (!token) return null;
  try { return openOpaqueToken(token, 'referral-attribution', 'referral-attribution'); }
  catch (error) { return null; }
}

export function clearAttributionCookie(event) {
  return clearCookie(ATTRIBUTION_COOKIE, attributionCookieOptions(event, 0));
}

