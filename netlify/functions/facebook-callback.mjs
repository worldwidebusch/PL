import { sanitizeNextPath } from './_lib/config.mjs';
import { upsertExternalIdentity } from './_lib/identity-adapter.mjs';
import {
  exchangeFacebookCode,
  fetchFacebookProfile,
  normalizeFacebookProfile,
  validateFacebookToken
} from './_lib/facebook-oauth.mjs';
import { json, queryParameters, redirect, safeErrorCode, withCookies } from './_lib/http.mjs';
import { recordReferralOperation } from './_lib/referral-adapter.mjs';
import {
  clearOAuthCookie,
  createSessionPayload,
  issueSessionCookie,
  readOAuthTransaction,
  readSession
} from './_lib/session.mjs';
import { randomSafeEqual } from './_lib/signed-token.mjs';
import { clearAttributionCookie, readReferralAttribution } from './_lib/referrals.mjs';

function appendStatus(path, status, reason) {
  const url = new URL(path, 'https://prolinker.invalid/');
  url.searchParams.set('oauth', 'facebook');
  url.searchParams.set('status', status);
  if (reason) url.searchParams.set('reason', reason);
  return url.pathname + url.search;
}

function errorPath(transaction, reason) {
  const url = new URL('/project/Prolinker%20Login.dc.html', 'https://prolinker.invalid/');
  url.searchParams.set('mode', transaction && transaction.intent === 'register' ? 'register' : 'login');
  if (transaction && transaction.role) url.searchParams.set('role', transaction.role);
  if (transaction && transaction.next) url.searchParams.set('next', transaction.next);
  url.searchParams.set('oauth', 'facebook');
  url.searchParams.set('status', 'error');
  url.searchParams.set('reason', reason || 'failed');
  return url.pathname + url.search;
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } }, { Allow: 'GET' });
  const clearTransaction = clearOAuthCookie(event, 'facebook');
  let transaction;
  try { transaction = readOAuthTransaction(event, 'facebook'); }
  catch (error) { transaction = null; }
  if (!transaction) return withCookies(redirect(errorPath(null, 'transaction')), clearTransaction);
  const query = queryParameters(event);
  const state = String(query.get('state') || '');
  if (!state || !randomSafeEqual(state, transaction.state)) return withCookies(redirect(errorPath(transaction, 'state')), clearTransaction);
  if (query.get('error')) return withCookies(redirect(errorPath(transaction, query.get('error') === 'access_denied' ? 'cancelled' : 'failed')), clearTransaction);
  const code = String(query.get('code') || '');
  if (!code || code.length > 5000) return withCookies(redirect(errorPath(transaction, 'code')), clearTransaction);
  try {
    const token = await exchangeFacebookCode(code, event);
    const valid = await validateFacebookToken(token.accessToken);
    const profile = normalizeFacebookProfile(await fetchFacebookProfile(token.accessToken, valid.subject));
    const existingSession = transaction.intent === 'import' ? await readSession(event) : null;
    if (transaction.intent === 'import' && (!existingSession || existingSession.user.id !== transaction.existingUserId)) {
      throw Object.assign(new Error('The account-link session changed.'), { code: 'ACCOUNT_LINK_SESSION_INVALID' });
    }
    if (transaction.intent === 'register' && (!transaction.registrationProfile || !transaction.registrationConsent)) {
      throw Object.assign(new Error('The signed registration context is incomplete.'), { code: 'REGISTRATION_CONTEXT_INVALID' });
    }
    const identity = await upsertExternalIdentity('facebook', profile, {
      intent: transaction.intent,
      role: transaction.role,
      referralCode: transaction.referralCode,
      registrationProfile: transaction.registrationProfile || null,
      registrationConsent: transaction.registrationConsent || null
    }, existingSession);
    if (existingSession && (identity.user.id !== existingSession.user.id || identity.user.role !== existingSession.user.role)) {
      throw Object.assign(new Error('The identity adapter linked a different user.'), { code: 'ACCOUNT_LINK_MISMATCH' });
    }

    const attribution = transaction.intent === 'register' ? readReferralAttribution(event) : null;
    let clearReferral = '';
    if (attribution) {
      if (attribution.referrerUserId !== identity.user.id) {
        const tracked = await recordReferralOperation('attributeReferral', {
          referrerUserId: attribution.referrerUserId,
          referredUserId: identity.user.id,
          shareId: attribution.shareId,
          entityType: attribution.entityType,
          entityId: attribution.entityId,
          capturedAt: attribution.capturedAt,
          attributedAt: new Date().toISOString()
        });
        if (tracked.tracked) clearReferral = clearAttributionCookie(event);
      } else clearReferral = clearAttributionCookie(event);
    }

    const previousProviders = existingSession && existingSession.auth && Array.isArray(existingSession.auth.providers) ? existingSession.auth.providers : [];
    const session = createSessionPayload({
      user: identity.user,
      role: identity.user.role,
      provider: existingSession && existingSession.auth ? existingSession.auth.provider : 'facebook',
      providers: Array.from(new Set(previousProviders.concat('facebook'))),
      phoneVerified: existingSession && existingSession.auth ? existingSession.auth.phoneVerified : false,
      linkedinProfile: existingSession && existingSession.linkedinProfile ? existingSession.linkedinProfile : null,
      referralCode: transaction.referralCode || (existingSession && existingSession.referralCode) || '',
      storageMode: identity.storageMode
    });
    const next = sanitizeNextPath(transaction.next, session.user.role, transaction.intent);
    return withCookies(redirect(appendStatus(next, 'success')), [await issueSessionCookie(session, event), clearTransaction, clearReferral]);
  } catch (error) {
    const reason = safeErrorCode(error).toLowerCase();
    console.error('[facebook-callback] ' + reason.toUpperCase());
    return withCookies(redirect(errorPath(transaction, reason)), clearTransaction);
  }
}
