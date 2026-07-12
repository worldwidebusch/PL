# ProLinker backend-for-frontend

This folder contains the server-side authentication and API boundary for
Netlify Functions. It supports WhatsApp OTP, LinkedIn OpenID Connect, Facebook
Login, opaque revocable sessions, referrals and a strict gateway to the private
backend adapter. Provider secrets and access tokens never reach browser code.

## Required setup

1. Create or select a LinkedIn Developer application.
2. Add the "Sign in with LinkedIn using OpenID Connect" product.
3. Register the exact HTTPS callback from `LINKEDIN_REDIRECT_URI`.
4. Create a Facebook Login application and register the exact HTTPS callback
   from `FACEBOOK_REDIRECT_URI`.
5. Configure the variables shown in the root `.env.example` in Netlify.
6. Generate `PROLINKER_SESSION_SECRET` with at least 32 random bytes.
7. Configure the private backend adapter and keep preview authentication off.

The flow requests only `openid profile email`. LinkedIn may omit email. The
OpenID Connect profile contains basic identity fields only. It does not provide
work history, skills, education, positions, or a CV.

## Routes

- `GET /api/v1/auth/linkedin/start`
- `POST /api/v1/auth/linkedin/start` for registration
- `GET /api/v1/auth/linkedin/callback`
- `GET /api/v1/auth/facebook/start`
- `POST /api/v1/auth/facebook/start` for registration
- `GET /api/v1/auth/facebook/callback`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/whatsapp/challenges`
- `POST /api/v1/auth/whatsapp/verify`
- `GET /api/v1/profile/imports/linkedin`
- `POST /api/v1/profile/imports/linkedin`
- `POST /api/v1/referrals/links`
- `POST /api/v1/referrals/events`
- `GET /r/:opaque-share-token`
- `/api/v1/*` to the private backend adapter through `api-gateway`

The start route accepts:

- `mode=login|register|import`
- `role=client|freelancer`
- `next=<allowlisted local app route>`
- `ref=<safe referral code>`

`next`, `role`, mode, and the referral code are stored in a short-lived signed
transaction cookie. The callback does not trust replacement values supplied in
its query string.

Registration starts with same-origin JSON POST instead of a query-string
redirect. The body contains `mode`, `role`, `next`, `ref`, a sanitized `profile`
object and `{ "consent": { "accepted": true } }`. The server records the current
terms and privacy versions, stores profile and consent in the signed transaction,
and returns `{ "authorizationUrl": "https://..." }`. Login and account linking
continue to use GET redirects. Passwords are never placed in OAuth transactions.

The profile import POST body is optional. To choose fields explicitly, send:

```json
{
  "fields": ["firstName", "lastName", "displayName", "email", "avatarUrl", "locale"]
}
```

Email is importable only when LinkedIn marks it as verified.

## Runtime modes and environment variables

Production requires `PROLINKER_BACKEND_ADAPTER_URL` and
`PROLINKER_BACKEND_ADAPTER_TOKEN`. The adapter provides durable identity,
WhatsApp verification, marketplace data, account state and referral storage.
`PROLINKER_IDENTITY_ADAPTER_URL` and `PROLINKER_IDENTITY_ADAPTER_TOKEN` are
compatibility aliases for a controlled migration of the existing LinkedIn
identity integration.

Signed-cookie preview storage is not a production database. It may be used
only when local development explicitly sets
`PROLINKER_ALLOW_PREVIEW_AUTH=true`. Public deployments, deploy previews and
production must set it to `false`. Local HTTP development also needs the
separate `PROLINKER_ALLOW_INSECURE_COOKIES=true` opt-in; never enable insecure
cookies on a public host.

| Variable | Purpose |
| --- | --- |
| `PROLINKER_APP_ORIGIN` | Exact public origin used for redirects and same-origin checks. |
| `PROLINKER_SESSION_SECRET` | Current signing and encryption secret, at least 32 random bytes. |
| `PROLINKER_SESSION_SECRET_PREVIOUS` | Optional previous secret during a controlled key rotation. |
| `PROLINKER_BACKEND_ADAPTER_URL` | Private HTTPS endpoint for gateway, WhatsApp and durable operations. |
| `PROLINKER_BACKEND_ADAPTER_TOKEN` | Server-only bearer credential for the private adapter. |
| `PROLINKER_ADAPTER_TIMEOUT_MS` | Bounded timeout for private adapter requests. |
| `PROLINKER_IDENTITY_ADAPTER_URL/TOKEN` | Compatibility aliases for the existing identity hook. |
| `PROLINKER_ALLOW_PREVIEW_AUTH` | Local-only explicit opt-in for non-durable preview sessions. |
| `PROLINKER_ALLOW_INSECURE_COOKIES` | Localhost-only explicit opt-in for HTTP cookies. |
| `PROLINKER_OTP_TTL_SECONDS` | WhatsApp challenge lifetime; defaults to 300 seconds. |
| `PROLINKER_OTP_RESEND_SECONDS` | Minimum resend interval; defaults to 60 seconds. |
| `PROLINKER_OTP_MAX_ATTEMPTS` | Maximum verification attempts; defaults to 5. |
| `PROLINKER_TERMS_VERSION` | Version recorded with every new account consent. |
| `PROLINKER_PRIVACY_VERSION` | Privacy version recorded with every new account consent. |
| `LINKEDIN_CLIENT_ID/SECRET/REDIRECT_URI` | LinkedIn OpenID Connect application settings. |
| `FACEBOOK_CLIENT_ID/SECRET/REDIRECT_URI` | Facebook Login application settings. |
| `FACEBOOK_GRAPH_VERSION` | Graph API version tested for the Facebook flow. |

No secret value belongs in `.env.example`, HTML, JavaScript, a mobile bundle,
logs or a query string.

## Backend adapter contract

The Netlify functions send one private server-to-server POST request per
operation. The adapter authenticates the bearer token, validates the actor and
performs authorization again. A gateway request uses this envelope:

```json
{
  "version": 1,
  "operation": "listOpportunities",
  "actor": {
    "userId": "usr_123",
    "role": "freelancer",
    "providers": ["linkedin"]
  },
  "requestId": "req_example",
  "params": {},
  "query": {},
  "body": {},
  "idempotencyKey": ""
}
```

The adapter returns a bounded JSON response such as:

```json
{
  "status": 200,
  "data": {
    "items": [],
    "total": 0,
    "nextCursor": null
  }
}
```

Allowed adapter operations are grouped below. The adapter must reject unknown
operations rather than forwarding an arbitrary path. The gateway allowlist is
defined in `_lib/api-route-contracts.mjs`; these names intentionally match it
exactly.

- Identity and sessions: `upsertLinkedInIdentity`, `upsertSocialIdentity`,
  `applyLinkedInProfile`, `createOtpChallenge`, `verifyOtpChallenge`,
  `createSession`, `resolveSession`, `revokeSession`.
- Accounts: `getDashboard`, `listNetwork`, `createNetworkInvitation`,
  `acceptNetworkInvitation`, `rejectNetworkInvitation`,
  `deleteNetworkConnection`, `getProfile`, `updateProfile`, `getSettings`,
  `updateSettings`.
- Work: `listAssignments`, `getAssignment`, `updateAssignment`,
  `listOpportunities`, `getOpportunity`, `saveOpportunity`,
  `unsaveOpportunity`, `setOpportunityHidden`, `createApplication`,
  `listApplications`, `searchFreelancers`, `createProject`,
  `inviteProjectProfessional`.
- Communication and finance: `listMessages`, `getMessage`,
  `createMessageReply`, `markMessageRead`, `archiveMessage`,
  `restoreMessage`, `getEarnings`, `getReferralSummary`.
- Referrals: `createReferralLink`, `recordReferralEvent`,
  `recordReferralCapture`, `attributeReferral`.

Challenge creation must return only a public challenge ID and expiry. The
adapter owns provider credentials, message delivery, attempt counters, IP and
phone rate limits, and one-time challenge consumption. Verification returns a
normalized user and provider metadata; it must never return an OTP, provider
token or password to the browser.

Registration challenge creation also carries the sanitized profile, versioned
consent record and, only for the legacy password form, an ephemeral credential.
Successful OTP verification must be replay-safe for a short bounded window so a
temporary session-write failure can be retried without asking for a second code.

When the registration UI supplies a password for legacy staging compatibility,
it is sent only in `context.credentials.password` on `createOtpChallenge`. The
adapter must hash it immediately with Argon2id, exclude request bodies from
logs, bind the hash to the expiring challenge, and delete it when the challenge
expires. The browser never receives the credential again, and WhatsApp remains
the primary login factor.

### Staging compatibility mapping

The older staging environment separates responsibilities across service
endpoints. Keep those variables inside the private adapter and map them to the
normalized operations as follows:

| Legacy staging convention | Normalized adapter responsibility |
| --- | --- |
| `SERVICE_ENDPOINT_USERS`, `FEED_ENDPOINT_USERS` | Identity, profiles, settings, network and freelancer search. |
| `SERVICE_ENDPOINT_PROJECTS` | Projects, opportunities, assignments and applications. |
| `SERVICE_ENDPOINT_SIGNAL`, `SERVICE_ENDPOINT_CHAT` | Messages, read state and notifications. |
| `SERVICE_ENDPOINT_FINANCE`, `FINANCE_XID` | Earnings and referral summary. Reward calculation stays in the payment ledger. |
| `SERVICE_ENDPOINT_PLANNER` | Availability and scheduling fields used by matching. |
| `SERVICE_ENDPOINT_BASE` | Categories, locales and shared reference data. |
| `SERVICE_ENDPOINT_ATLAS` | Location and geographic lookup when enabled. |
| `BACKEND_JWT_KEY`, `USERS_JWT_KEY` | Adapter-to-legacy authentication only. Never expose these to Netlify responses or browser code. |

Normalize legacy fields at the adapter boundary:

| Legacy field variants | Public normalized field |
| --- | --- |
| `id`, `user_id`, `uid` | `id` |
| `first_name`, `firstname` | `firstName` |
| `last_name`, `lastname` | `lastName` |
| `display_name`, `name` | `displayName` |
| `company_name`, `business_name`, `organisation_name` | `companyName` |
| `employer`, `opdrachtgever` | role `client` |
| `freelancer`, `professional` | role `freelancer` |
| `data`, `results`, `records` | `items` |
| `total_count`, `count` | `total` |
| `next_cursor`, `next_page_token` | `nextCursor` |

Amounts must cross the boundary as minor integer units plus an ISO currency.
Dates must be ISO 8601 UTC strings. IDs are opaque strings. The adapter must
not infer account linking from an unverified email address.

## Identity adapter hook

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

Facebook uses `upsertSocialIdentity` with the same envelope and
`identity.provider` set to `facebook`. Account linking must use the provider
subject, never an unverified email match.

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

OAuth transaction cookies are signed, HttpOnly, SameSite=Lax and Secure by
default. Production session cookies contain only a random opaque token; the
adapter stores its hash and resolves or revokes it server-side. Insecure
cookies can be enabled only for explicit localhost development through
`PROLINKER_ALLOW_INSECURE_COOKIES=true`.
The preview session is intentionally provider-neutral. The public session
endpoint returns the user, provider list, import metadata, storage mode, and
expiry. It never returns the LinkedIn access token, ID token, client secret, or
provider subject.

## Local verification

Run the dependency-free checks with Node.js 22:

```bash
npm run check
npm test
npm run build
```

For a local Netlify function preview, set non-production values in the shell or
an untracked `.env` file. Preview auth must be explicit:

```text
PROLINKER_APP_ORIGIN=http://localhost:8888
PROLINKER_SESSION_SECRET=<at-least-32-random-bytes>
PROLINKER_ALLOW_PREVIEW_AUTH=true
PROLINKER_ALLOW_INSECURE_COOKIES=true
```

Do not copy these preview flags to Netlify production or deploy previews. The
CI workflow verifies helper contracts and builds the same `dist/` directory
that Netlify publishes.
