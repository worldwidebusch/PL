# ProLinker LinkedIn authentication scaffold

This folder contains a server-side LinkedIn OpenID Connect flow for Netlify
Functions. It does not expose the LinkedIn client secret or access token to the
browser.

## Required setup

1. Create or select a LinkedIn Developer application.
2. Add the "Sign in with LinkedIn using OpenID Connect" product.
3. Register the exact HTTPS callback from `LINKEDIN_REDIRECT_URI`.
4. Configure the variables shown in the root `.env.example` in Netlify.
5. Generate `PROLINKER_SESSION_SECRET` with at least 32 random bytes.

The flow requests only `openid profile email`. LinkedIn may omit email. The
OpenID Connect profile contains basic identity fields only. It does not provide
work history, skills, education, positions, or a CV.

## Routes

- `GET /api/v1/auth/linkedin/start`
- `GET /api/v1/auth/linkedin/callback`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/logout`
- `GET /api/v1/profile/imports/linkedin`
- `POST /api/v1/profile/imports/linkedin`
- `POST /api/v1/referrals/links`
- `POST /api/v1/referrals/events`
- `GET /r/:opaque-share-token`

The start route accepts:

- `mode=login|register|import`
- `role=client|freelancer`
- `next=<allowlisted local app route>`
- `ref=<safe referral code>`

`next`, `role`, mode, and the referral code are stored in a short-lived signed
transaction cookie. The callback does not trust replacement values supplied in
its query string.

The profile import POST body is optional. To choose fields explicitly, send:

```json
{
  "fields": ["firstName", "lastName", "displayName", "email", "avatarUrl", "locale"]
}
```

Email is importable only when LinkedIn marks it as verified.

## Identity adapter hook

Without `PROLINKER_IDENTITY_ADAPTER_URL`, the functions use a signed-cookie
preview session. This works for a prototype, but it cannot provide durable
account linking, server-side revocation, or durable referral attribution.

When an adapter URL and token are configured, the callback sends a private
server-to-server POST request with one of these operations:

### `upsertLinkedInIdentity`

```json
{
  "version": 1,
  "operation": "upsertLinkedInIdentity",
  "identity": {
    "provider": "linkedin",
    "providerSubject": "pairwise-linkedin-subject",
    "profile": {}
  },
  "context": {
    "intent": "login",
    "role": "freelancer",
    "referralCode": "example-code",
    "existingUserId": ""
  }
}
```

### `applyLinkedInProfile`

```json
{
  "version": 1,
  "operation": "applyLinkedInProfile",
  "userId": "usr_123",
  "fields": ["firstName", "avatarUrl"],
  "profile": {},
  "context": { "role": "freelancer" }
}
```

The adapter must return:

```json
{
  "user": {
    "id": "usr_123",
    "role": "freelancer",
    "displayName": "Example Member",
    "firstName": "Example",
    "lastName": "Member",
    "email": "member@example.com",
    "emailVerified": true,
    "avatarUrl": "https://example.com/avatar.jpg",
    "locale": "nl-NL"
  }
}
```

The adapter should enforce a unique database constraint on
`(provider, provider_subject)`. It should never link accounts solely because
their email addresses match. Referral attribution should be created atomically
only for the first eligible registration, with self-referrals rejected.

## Referral link and event contract

Creating a link requires an authenticated session and a same-origin POST:

```json
{
  "entityType": "opportunity",
  "entityId": "job-123",
  "targetUrl": "/project/Prolinker%20Voor%20jou%20v2.dc.html?job=job-123",
  "channel": "linkedin",
  "campaign": "member-share"
}
```

The response contains `url`, `shareUrl`, `shareId`, and the normalized share
metadata. The URL uses `/r/:token`. The token is encrypted, authenticated, and
separately HMAC-signed. It does not reveal the referring member ID or target.

Opening a valid share URL records a best-effort capture event, preserves the
first valid attribution, stores it in an HttpOnly cookie for 30 days, and
redirects only to an allowlisted same-origin ProLinker page. If the signed-in
visitor is the referrer, no attribution cookie is created.

The frontend event names are limited to:

- `share_opened`
- `share_selected`
- `link_copied`

Event creation requires an authenticated session and a same-origin POST. These
events are activity telemetry only. They cannot create conversion, payment, or
reward claims. Fields such as amount, reward, rate, settlement, and transaction
ID are explicitly rejected.

The private adapter may receive these additional operations:

- `createReferralLink`
- `recordReferralEvent`
- `recordReferralCapture`
- `attributeReferral`

`attributeReferral` is sent only after registration, only when the referred and
referring user IDs differ, and never contains a reward amount. The adapter must
make attribution idempotent by `shareId` and referred user ID. It must also
enforce first-touch ownership and reject self-referrals independently.

Referral rewards must be calculated by a separate payment-ledger process only
after an eligible ProLinker payment is irrevocably settled. Share, capture,
registration, and client event endpoints always return
`rewardStatus: "not_calculated"` where applicable.

## Cookie behavior

Both transaction and session cookies are signed, HttpOnly, SameSite=Lax, and
Secure by default. Insecure cookies can be enabled only for explicit localhost
development through `PROLINKER_ALLOW_INSECURE_COOKIES=true`.

The preview session is intentionally provider-neutral. The public session
endpoint returns the user, provider list, import metadata, storage mode, and
expiry. It never returns the LinkedIn access token, ID token, client secret, or
provider subject.
