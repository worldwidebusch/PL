import { sanitizeNextPath } from './_lib/config.mjs';
import { json, queryParameters, redirect, safeErrorCode, withCookies } from './_lib/http.mjs';
import { upsertLinkedInIdentity } from './_lib/identity-adapter.mjs';
import { recordReferralOperation } from './_lib/referral-adapter.mjs';
import {
  exchangeCode,
  fetchUserInfo,
  normalizeLinkedInProfile,
  validateIdToken
} from './_lib/linkedin-oidc.mjs';
import {
  clearOAuthCookie,
  createSessionPayload,
  readOAuthTransaction,
  readSession,
  sessionCookie
} from './_lib/session.mjs';
import { randomSafeEqual } from './_lib/signed-token.mjs';
import { clearAttributionCookie, readReferralAttribution } from './_lib/referrals.mjs';

function appendStatus(path, status, reason) {
  const base = new URL('https://prolinker.invalid/');
  const url = new URL(path, base);
  url.searchParams.set('oauth', 'linkedin');
  url.searchParams.set('status', status);
  if (reason) url.searchParams.set('reason', reason);
  else url.searchParams.delete('reason');
  return url.pathname + url.search;
}

function errorPath(transaction, reason) {
  const url = new URL('/project/Prolinker%20Login.dc.html', 'https://prolinker.invalid/');
  url.searchParams.set('mode', transaction && transaction.intent === 'register' ? 'register' : 'login');
  if (transaction && transaction.role) url.searchParams.set('role', transaction.role);
  if (transaction && transaction.next) url.searchParams.set('next', transaction.next);
  url.searchParams.set('oauth', 'linkedin');
  url.searchParams.set('status', 'error');
  url.searchParams.set('reason', reason || 'failed');
  return url.pathname + url.search;
}

function cancellationReason(value) {
  const reason = String(value || '').toLowerCase();
  return reason === 'user_cancelled_login' || reason === 'user_cancelled_authorize' || reason === 'access_denied'
    ? 'cancelled'
    : 'failed';
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, { Allow: 'GET' });

  let transaction = null;
  let clearTransaction = '';
  try {
    transaction = readOAuthTransaction(event);
    clearTransaction = clearOAuthCookie(event);
  } catch (error) {
    return json(503, { error: { code: 'AUTH_CONFIGURATION_ERROR', message: 'LinkedIn login is not configured yet.' } });
  }
  if (!transaction) {
    return withCookies(json(400, { error: { code: 'OAUTH_TRANSACTION_INVALID', message: 'The login attempt expired. Start again.' } }), clearTransaction);
  }

  const query = queryParameters(event);
  const returnedState = String(query.get('state') || '');
  if (!returnedState || !randomSafeEqual(returnedState, transaction.state)) {
    return withCookies(redirect(errorPath(transaction, 'state')), clearTransaction);
  }
  if (query.get('error')) {
    return withCookies(redirect(errorPath(transaction, cancellationReason(query.get('error')))), clearTransaction);
  }

  const code = String(query.get('code') || '');
  if (!code || code.length > 5000) {
    return withCookies(redirect(errorPath(transaction, 'code')), clearTransaction);
  }

  try {
    const tokens = await exchangeCode(code, event);
    const idClaims = await validateIdToken(tokens.idToken, transaction.nonce);
    const userInfo = await fetchUserInfo(tokens.accessToken, idClaims.sub);
    const linkedinProfile = normalizeLinkedInProfile(idClaims, userInfo);
    if (!linkedinProfile.subject) throw Object.assign(new Error('Missing subject.'), { code: 'PROFILE_INVALID' });

    const existingSession = transaction.intent === 'import' ? readSession(event) : null;
    if (transaction.intent === 'import') {
      if (!existingSession || existingSession.user.id !== transaction.existingUserId) {
        throw Object.assign(new Error('The account-link session changed.'), { code: 'ACCOUNT_LINK_SESSION_INVALID' });
      }
    }

    const identityResult = await upsertLinkedInIdentity(linkedinProfile, {
      intent: transaction.intent,
      role: transaction.role,
      referralCode: transaction.referralCode
    }, existingSession);

    if (existingSession && (
      identityResult.user.id !== existingSession.user.id
      || identityResult.user.role !== existingSession.user.role
    )) {
      throw Object.assign(new Error('The identity adapter linked a different user.'), { code: 'ACCOUNT_LINK_MISMATCH' });
    }

    const referralAttribution = transaction.intent === 'register' ? readReferralAttribution(event) : null;
    let referralCookieToClear = '';
    if (referralAttribution) {
      const selfAttribution = referralAttribution.referrerUserId === identityResult.user.id;
      if (!selfAttribution) {
        const attributionResult = await recordReferralOperation('attributeReferral', {
          referrerUserId: referralAttribution.referrerUserId,
          referredUserId: identityResult.user.id,
          shareId: referralAttribution.shareId,
          entityType: referralAttribution.entityType,
          entityId: referralAttribution.entityId,
          capturedAt: referralAttribution.capturedAt,
          attributedAt: new Date().toISOString()
        });
        if (attributionResult.tracked) referralCookieToClear = clearAttributionCookie(event);
      } else {
        referralCookieToClear = clearAttributionCookie(event);
      }
    }

    const previousProviders = existingSession && existingSession.auth && Array.isArray(existingSession.auth.providers)
      ? existingSession.auth.providers
      : [];
    const providers = Array.from(new Set(previousProviders.concat('linkedin')));
    const provider = existingSession && existingSession.auth ? existingSession.auth.provider : 'linkedin';
    const session = createSessionPayload({
      user: identityResult.user,
      role: identityResult.user.role,
      provider,
      providers,
      phoneVerified: existingSession && existingSession.auth ? existingSession.auth.phoneVerified : false,
      linkedinProfile,
      referralCode: transaction.referralCode || (existingSession && existingSession.referralCode) || '',
      storageMode: identityResult.storageMode
    });
    const next = sanitizeNextPath(transaction.next, session.user.role, transaction.intent);
    const result = redirect(appendStatus(next, 'success'));
    return withCookies(result, [sessionCookie(session, event), clearTransaction, referralCookieToClear]);
  } catch (error) {
    const codeName = safeErrorCode(error);
    console.error('[linkedin-callback] ' + codeName);
    return withCookies(redirect(errorPath(transaction, codeName.toLowerCase())), clearTransaction);
  }
}
