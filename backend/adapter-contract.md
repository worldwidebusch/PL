# ProLinker backend adapter contract

Status: implementation contract, version 1

Database target: PostgreSQL 15+

Schema: [`postgres-schema.sql`](./postgres-schema.sql)

This document is the hand-off between the public Netlify functions and the private,
durable ProLinker backend. The browser never connects to PostgreSQL and never receives
the private adapter bearer token. The adapter is responsible for authorization below
the route layer, tenant isolation, transactions, idempotency, audit records, and the
public response DTOs.

## 1. Deployment boundary

The public functions call one private HTTPS endpoint configured by
`PROLINKER_BACKEND_ADAPTER_URL` and authenticated by
`PROLINKER_BACKEND_ADAPTER_TOKEN`. The adapter endpoint must:

- accept only TLS;
- validate the bearer token with a constant-time comparison or an identity-aware
  service-to-service mechanism;
- never log the bearer token, session tokens, OTP codes, OAuth codes, access tokens,
  decrypted phone numbers, or decrypted email addresses;
- enforce a strict request size and a response size below 2 MiB;
- use a non-owner PostgreSQL role without `BYPASSRLS`;
- resolve the tenant from trusted deployment/host configuration, never from a public
  body or query parameter;
- start every database transaction with
  `SELECT set_config('app.tenant_id', :tenant_uuid, true)`;
- write `requestId` to the audit log and return it on every response.

The database owner is a migration role only. Contact values are envelope-encrypted
outside PostgreSQL; deterministic, peppered lookup hashes are stored separately for
uniqueness and lookup. CV/document bytes live in private object storage, not in the
database.

## 2. Transport envelope

All adapter calls are `POST` requests with `Content-Type: application/json`.

```json
{
  "version": 1,
  "operation": "operationName",
  "requestId": "opaque-request-id",
  "actor": {
    "userId": "usr_opaque",
    "role": "freelancer",
    "provider": "whatsapp",
    "providers": ["whatsapp"]
  },
  "params": {},
  "query": {},
  "body": {},
  "idempotencyKey": "optional-client-key"
}
```

`actor` is omitted for optional-auth, anonymous reads and for direct auth operations.
The adapter must resolve external/public IDs to tenant-bound UUIDs; it must not accept
an actor's claimed role or ownership as sufficient proof. Re-read the user, session,
membership and target ownership in the same database transaction.

Successful response:

```json
{
  "ok": true,
  "status": 200,
  "data": {}
}
```

`status` may be any appropriate 2xx status. `data` may also be returned as `result` for
backward adapter compatibility, but new implementations should use `data`.

Failure response:

```json
{
  "ok": false,
  "error": {
    "code": "STABLE_UPPERCASE_CODE",
    "message": "Safe public message",
    "details": {}
  }
}
```

Use HTTP `400` for validation, `401` for an invalid/expired session, `403` for role or
ownership failures, `404` for tenant-scoped absence, `409` for state/idempotency
conflicts, `422` for a valid request that cannot transition, `429` for throttling, and
`5xx` only for retryable infrastructure failures. Never expose SQL, provider payloads,
stack traces, existence of another person's account, or decrypted contact data.

## 3. IDs, cursors, money and time

- External API IDs are opaque strings (`usr_...`, `opp_...`, `app_...`, etc.). UUIDs remain
  internal.
- Legacy `xid` and `partitionXid` values are not domain keys. Store them only in
  `external_id_mappings` with an explicit `system_key` and `entity_type`.
- List cursors are opaque, signed or authenticated, stable encodings of the complete
  sort tuple. Do not use a naked row offset for production feeds.
- All timestamps are UTC RFC 3339 strings on the wire and `timestamptz` in PostgreSQL.
- Money is stored as integer minor units plus an ISO-4217 uppercase currency. Floating
  point values are never used for balances or settlement.
- Scores are decimal `0..100`. Referral rates are server-controlled basis points;
  the current product rate is 200 basis points (2%).

## 4. Authentication and identity operations

### `createOtpChallenge`

Input is the current direct payload:

```json
{
  "challenge": {
    "id": "uuid",
    "channel": "whatsapp",
    "phone": "E.164 value in transit only",
    "intent": "login|register",
    "role": "freelancer|client",
    "locale": "nl-NL",
    "ttlSeconds": 600,
    "resendAfterSeconds": 60,
    "maxAttempts": 6
  },
  "context": {
    "next": "/safe-local-path",
    "referralCode": "",
    "referralAttribution": null,
    "profile": {},
    "credentials": {},
    "consent": null,
    "clientIp": "transport context",
    "userAgent": "transport context",
    "requestedAt": "RFC3339"
  }
}
```

The adapter generates a cryptographically random six-digit OTP, stores only a
challenge-specific password hash/HMAC in `otp_challenges.code_hash`, encrypts the
phone destination, stores a peppered lookup hash and last four digits, applies resend
and per-destination/IP throttles, and sends through an approved WhatsApp provider.
The provider credential belongs in a secret manager. Return only a generic accepted
result; never return the OTP or reveal whether the phone already has an account.

For registration, `context.profile` is the sanitized basic profile,
`context.credentials` is either empty or `{ "password": "in transit only" }`, and
`context.consent` is `{ "termsVersion", "privacyVersion", "acceptedAt" }`.
Immediately hash an accepted password with Argon2id and keep only the pending hash on
the short-lived challenge; never persist or log the credential plaintext. Encrypt the
registration profile, persist the exact consent versions/timestamp, and copy the
verified consent to `user_consents` when registration succeeds. Do not put a raw
phone, password or code in `referral_context`.

### `verifyOtpChallenge`

Input:

```json
{
  "challenge": { "id": "uuid", "code": "six digits in transit only" },
  "context": {
    "clientIp": "transport context",
    "userAgent": "transport context",
    "verifiedAt": "RFC3339"
  }
}
```

Within one transaction and a row lock:

1. reject invalidated, expired or exhausted challenges;
2. increment `attempts` before returning a failure;
3. compare the supplied code in constant time;
4. mark `consumed_at` exactly once;
5. resolve or create the user and a `whatsapp` identity whose provider subject is a
   non-reversible phone lookup hash, not the phone itself;
6. promote the pending Argon2id hash to `password_credentials` when present and append
   the captured versions to `user_consents` for a registration;
7. apply a valid first-touch referral once, ignoring self-referrals;
8. return the durable user.

After the first successful consumption, store `verified_user_id` and a short
`replay_until` window. A retry with the same challenge and matching code during that
window returns the same durable user/result without repeating account creation,
consent, identity or referral mutations. A different code, an expired replay window,
or a challenge without a completed result fails generically. This makes a lost
verification response/session-cookie retry safe while keeping the OTP single-use for
all other purposes.

Response data:

```json
{
  "user": {
    "id": "usr_opaque",
    "role": "freelancer|client",
    "firstName": "",
    "lastName": "",
    "displayName": "",
    "avatarUrl": "",
    "locale": "nl-NL"
  },
  "providers": ["whatsapp"],
  "referralAttributed": false
}
```

### `upsertLinkedInIdentity` and `upsertSocialIdentity`

The latter currently handles Facebook. Input contains:

```json
{
  "identity": {
    "provider": "linkedin|facebook",
    "providerSubject": "provider-scoped subject",
    "profile": {
      "firstName": "",
      "lastName": "",
      "displayName": "",
      "email": "in transit only",
      "emailVerified": false,
      "avatarUrl": "",
      "locale": "",
      "importedAt": "RFC3339"
    }
  },
  "context": {
    "intent": "login|register|import",
    "role": "freelancer|client",
    "referralCode": "",
    "existingUserId": "usr_opaque-or-empty",
    "registrationProfile": null,
    "registrationConsent": null
  }
}
```

The `(provider, provider_subject)` pair is globally unique. A login resolves only by
that pair. Never auto-link accounts by email, display name or phone. `intent=import`
must require a valid current session and may link only to `existingUserId`; a subject
already owned by another user returns `409 IDENTITY_ALREADY_LINKED`. OAuth access and
refresh tokens are not stored in `provider_profile`.

For `intent=register`, `registrationProfile` contains the sanitized basic account
fields and `registrationConsent` contains the server-selected terms version, privacy
version and acceptance time. Create the user, role profile, provider identity and
consent rows in one database transaction. For login and import, both fields are null.

Return `{ "user": sessionUser }`.

### `applyLinkedInProfile`

Input: `{ "userId", "fields", "profile", "context": { "role" } }`. Only the
allowlisted requested fields may be applied. An email may be imported only when the
OIDC/provider evidence marks it verified. Record a `profile_imports` row, the proposed
and applied field set, and an audit entry. Return `{ "user": sessionUser }`.

### `createSession`, `resolveSession`, `revokeSession`

The Netlify function creates the random browser token and sends only its keyed hash.

- `createSession` input is `{ "session": { "tokenHash", "userId", "role",
  "provider", "providers", "phoneVerified", "referralCode", "createdAt",
  "expiresAt" }, "context": { "clientIp", "userAgent" } }`.
  Persist only `tokenHash`; return `{ "ok": true }`.
- `resolveSession` input is `{ "session": { "tokenHash" } }`. Return nothing for a
  missing, expired or revoked session; otherwise the response `data` must contain a
  top-level `user` and a separate session record:
  `{ "user": sessionUser, "session": { "provider", "providers",
  "phoneVerified", "referralCode", "createdAt", "expiresAt" } }`. Optional
  `linkedinProfile` is also top-level. The consumer deliberately rejects a user nested
  only inside `session`.
- `revokeSession` input is `{ "session": { "tokenHash", "revokedAt" } }` and is
  idempotent.

Resolve and revoke by `auth_sessions.token_hash`. Raw session tokens must never cross
the private adapter boundary or be stored in PostgreSQL.

## 5. Public gateway operation catalogue

All operations in this table use the common envelope. Required actors and route
validation are enforced by the public gateway and must be enforced again by the
adapter.

| HTTP route | Operation | Actor | Primary tables |
|---|---|---|---|
| `GET /api/v1/dashboard` | `getDashboard` | any account | users, assignments, activity/audit aggregates |
| `GET /api/v1/network` | `listNetwork` | any account | network connections/invitations, profiles |
| `POST /api/v1/network/invitations` | `createNetworkInvitation` | any account | network invitations, outbox |
| `POST /api/v1/network/invitations/:id/accept` | `acceptNetworkInvitation` | invitee | invitations, connections |
| `POST /api/v1/network/invitations/:id/reject` | `rejectNetworkInvitation` | invitee | invitations |
| `DELETE /api/v1/network/connections/:id` | `deleteNetworkConnection` | participant | connections |
| `GET /api/v1/profiles/:id` | `getProfile` | any account | users, profiles, skills, resume, portfolio |
| `PATCH /api/v1/profiles/:id` | `updateProfile` | same user only | profiles and child collections |
| `GET /api/v1/assignments` | `listAssignments` | any account | assignments/projects/opportunities |
| `GET /api/v1/assignments/:id` | `getAssignment` | participant | assignments and related records |
| `PATCH /api/v1/assignments/:id` | `updateAssignment` | participant, transition-specific | assignments |
| `GET /api/v1/messages` | `listMessages` | participant | conversations, participants, messages |
| `POST /api/v1/messages/:id/replies` | `createMessageReply` | participant | messages, outbox |
| `POST /api/v1/messages/:id/read` | `markMessageRead` | participant | conversation participants |
| `POST /api/v1/messages/:id/archive` | `archiveMessage` | participant | conversation participants |
| `POST /api/v1/messages/:id/restore` | `restoreMessage` | participant | conversation participants |
| `GET /api/v1/messages/:id` | `getMessage` | participant | conversation and messages |
| `GET /api/v1/earnings` | `getEarnings` | account owner | ledger, payouts, referral rewards |
| `GET /api/v1/settings` | `getSettings` | account owner | user settings |
| `PATCH /api/v1/settings` | `updateSettings` | account owner | user settings |
| `GET /api/v1/opportunities` | `listOpportunities` | optional | opportunities, matches/preferences/applications |
| `PUT /api/v1/opportunities/:id/saved` | `saveOpportunity` | freelancer | opportunity preferences |
| `DELETE /api/v1/opportunities/:id/saved` | `unsaveOpportunity` | freelancer | opportunity preferences |
| `PUT /api/v1/opportunities/:id/hidden` | `setOpportunityHidden` | freelancer | opportunity preferences |
| `GET /api/v1/opportunities/:id` | `getOpportunity` | optional | opportunity and personalized state |
| `GET /api/v1/applications` | `listApplications` | freelancer | applications |
| `POST /api/v1/applications` | `createApplication` | freelancer | applications, deliveries, outbox |
| `GET /api/v1/freelancers` | `searchFreelancers` | optional | searchable freelancer profiles |
| `POST /api/v1/projects` | `createProject` | client | opportunities, projects, participants |
| `POST /api/v1/projects/:id/invitations` | `inviteProjectProfessional` | owning client | project invitations/participants, conversations, outbox |
| `GET /api/v1/referrals/summary` | `getReferralSummary` | any account | links, attributions, rewards, ledger |

### Ownership and transition rules

- `updateProfile` accepts `params.id=me` or the actor's own public user ID only.
- A network invitation can be accepted/rejected only by its resolved invitee. A
  connection can be removed only by either endpoint.
- Conversations and messages are visible only to an active participant.
- A freelancer can write only their own preferences and applications.
- A client can create a project for themself or an organization in which they hold an
  active owner/admin/member role with posting permission.
- `inviteProjectProfessional` requires ownership/posting permission on the project,
  requires a visible freelancer profile, deduplicates an existing invitation, inserts
  the `invited` participant state, and queues delivery atomically. It never exposes the
  freelancer's private contact fields to the client.
- Project, application and assignment status transitions are allowlisted state
  machines. A public body cannot skip financial or acceptance transitions.
- `updateAssignment` public actions currently are `archive`, `unarchive`, and
  `withdraw`; map these to participant archive state or a legal withdrawal state,
  rather than blindly storing the verb as an assignment status.

### Atomic project creation

`createProject` creates an internal `opportunities` row, a `projects` row and the
creator's `project_participants` row in one transaction. It must honor an
idempotency key when supplied and may also use the client-supplied draft ID as an
external mapping, never as the internal UUID. Return the project DTO only after all
three writes commit.

### Atomic application creation

`createApplication` must:

1. claim `(tenant, actor, scope, idempotencyKey)` in
   `request_idempotency_keys` when a key is supplied;
2. lock/resolve the opportunity and verify it is open;
3. return the existing application with `duplicate: true` when the freelancer has
   already applied;
4. create one application plus its first delivery/outbox event atomically;
5. replay the original status/body for a repeated key with the same request hash;
6. return `409 IDEMPOTENCY_KEY_REUSED` when the same key has a different hash.

Email and WhatsApp application delivery must be performed by asynchronous workers.
The request transaction queues an outbox event; it does not call a provider while
holding database locks. Provider message IDs and webhook event IDs are unique for
exactly-once reconciliation. Automatic applications require explicit user consent,
auditable filters and rate limits; they do not bypass the same duplicate and
idempotency constraints.

## 6. Response DTOs used by the current frontend

The frontend accepts a few aliases for compatibility, but the adapter should emit the
canonical forms below.

### Collection

```json
{ "items": [], "total": 0, "nextCursor": null }
```

`limit` is capped server-side (recommended maximum 100; 250 only for controlled
exports). Cursor pagination order must include a unique final key.

### Opportunity

```json
{
  "id": "opp_opaque",
  "title": "",
  "summary": "",
  "description": "",
  "company": "",
  "source": "internal|partner|external",
  "opportunityType": "freelance|employment",
  "relevance": 0,
  "remote": true,
  "locationLabel": "",
  "locationKey": "",
  "country": "NL",
  "latitude": null,
  "longitude": null,
  "hoursMin": null,
  "hoursMax": null,
  "rateLabel": "",
  "postedAt": "RFC3339",
  "closesAt": null,
  "startAt": null,
  "durationWeeks": null,
  "tags": [],
  "reasons": [],
  "saved": false,
  "hidden": false,
  "applicationStatus": ""
}
```

`relevance`, reasons, saved/hidden and application status are actor-specific. An
anonymous request receives neutral relevance and no private preference/application
state. Radius filtering must be calculated from verified coordinates; a user-provided
label alone is not treated as verified geography.

### Application

```json
{
  "id": "app_opaque",
  "opportunityId": "opp_opaque",
  "status": "submitted",
  "createdAt": "RFC3339",
  "updatedAt": "RFC3339",
  "duplicate": false
}
```

### Freelancer search result

```json
{
  "id": "usr_opaque",
  "name": "",
  "initials": "",
  "headline": "",
  "location": "",
  "availability": "",
  "skills": [],
  "verified": false,
  "match": 0,
  "rate": "",
  "profileHref": ""
}
```

Only searchable, non-deleted freelancer profiles appear. Email, phone, private CV
objects, provider subjects and internal UUIDs never appear.

### Message thread

```json
{
  "id": "cvs_opaque",
  "sender": "",
  "subject": "",
  "preview": "",
  "unread": false,
  "archived": false,
  "at": "RFC3339",
  "messages": [
    { "id": "msg_opaque", "sender": "", "direction": "incoming|outgoing", "text": "", "at": "RFC3339", "read": true }
  ]
}
```

Read/archive state comes from `conversation_participants`, so one user's archive does
not hide the thread for another participant.

### Dashboard, network, settings and earnings

- `getDashboard`: `{ role, user, metrics: [], activity: [], updatedAt }`.
- `listNetwork`: `{ currentUser, members: [], invitations: [], outbound: [], totals,
  updatedAt }`.
- `getSettings`/`updateSettings`: `{ language, notifications, privacy }`.
- `getEarnings`: return server-computed totals and transactions. Never accept a
  balance, payout status, reward amount or referral rate from the browser.
- `getReferralSummary`: `{ currency, rewardRate, availableAmount, pendingAmount,
  paidAmount, totalEarned, referredCount, convertedCount, shareUrl, referrals: [] }`.

## 7. Referral operations and first-touch rules

### `createReferralLink`

Input includes `referrerUserId` and `share: { shareId, entityType, entityId, target,
channel, campaign, createdAt, expiresAt }`. Resolve the referrer from the authenticated
session in the calling flow, validate that the shared entity is visible to that user,
and insert by unique `share_id`. The current edge flow verifies a signed share token
without sending that token to the adapter; do not invent or persist a raw token. If a
future adapter does receive a token, store only a keyed `token_hash`.

Return `{ "tracked": true }`.

### `recordReferralCapture`

Input includes `{ shareId, referrerUserId, actorUserId, entityType, entityId,
capturedAt, attributionStored, firstTouchPreserved, selfAttributionIgnored }`.
Treat this operation as idempotent telemetry. Store a capture/event when possible.
When a stable privacy-safe visitor key is available, store only its keyed hash and let
`referral_captures_first_touch_uq` enforce one first touch. The current edge cookie is
the first-touch source of truth before registration.

### `recordReferralEvent`

Input includes `actorUserId` and `event: { name, shareId, channel, occurredAt }`.
Public activity is telemetry only. It cannot create a reward, select a beneficiary,
set a percentage, claim a hire or move money.

### `attributeReferral`

Input includes `{ referrerUserId, referredUserId, shareId, entityType, entityId,
capturedAt, attributedAt }`. In one transaction:

- lock the referred user and link;
- ensure the link belongs to the supplied referrer;
- reject/ignore `referrerUserId = referredUserId`;
- preserve the first attribution using the unique `(tenant_id, referred_user_id)`
  constraint;
- bind the attribution to a capture for the same link;
- return the existing first attribution on harmless retries and never replace it.

Referral rewards are created only from a server-confirmed paid assignment. The
beneficiary must equal the attribution referrer, the rate is read from trusted product
configuration, and settlement is a balanced ledger transaction. A reversal creates a
new reversing transaction; posted ledger rows are not edited.

## 8. Finance and ledger invariants

- Every posted `ledger_transaction` has at least two postings, one currency and a net
  debit/credit balance of zero. The deferred constraint triggers enforce this at
  commit.
- A transaction is assembled as `pending`, postings are inserted, then it becomes
  `posted` with `posted_at` in the same transaction.
- Provider webhooks are authenticated before insertion and deduplicated by
  `(tenant, provider, provider_event_id)`.
- `payments`, `payouts` and `referral_rewards` derive their financial truth from the
  ledger. Cached UI totals are never authoritative.
- Payout bank details and provider payment methods are tokenized by the payment
  provider; do not add raw IBAN, card or bank credentials to this schema.
- Use `SELECT ... FOR UPDATE` on affected balance/account rows where concurrent
  settlement could race.

## 9. CV and profile imports

An upload flow should issue a short-lived, content-type/size-restricted object-storage
upload URL, then create `stored_documents` only after the object checksum is verified
and malware scanning succeeds. The worker writes structured extraction to
`extracted_data` and a `profile_imports` proposal. The user reviews selected fields;
only then are `profiles`, `profile_skills`, `resume_entries` and `portfolio_items`
updated in one transaction. Keep the original private, use signed download URLs, and
honor retention/deletion requests. Never store CV bytes or a public object URL in
PostgreSQL.

## 10. Legacy staging semantic mapping

The old Laravel staging application was a facade over external user, project,
conversation and finance services. The SQL model is not a copy of its `xid` model.
Normalize at the adapter boundary as follows:

| Legacy value | Canonical value / location |
|---|---|
| `xid`, `partitionXid` | `external_id_mappings`; never a domain primary key |
| project `match` | project/assignment `matched` |
| project `autoclosed` | `auto_closed` |
| project `canceled` | `cancelled` |
| other project statuses `created`, `refused`, `open`, `paused`, `selection`, `in_progress`, `pending_completion`, `completed` | same canonical spelling |
| project role `employer`, `agent`, `client`, `invited`, `interested`, `refused`, `assigned` | `project_participants.role` |
| location `onsite` | `work_mode=onsite` |
| location `meet_regular`, `meet_occasional`, `remote` | same canonical work mode |
| schedule `asap` | `start_mode=asap` |
| schedule `discuss` | `start_mode=discuss` |
| schedule `endless` | no `end_at`; duration remains null |
| balance `deposit`, `transfer_out`, `transfer_in`, `withdrawal` | same ledger transaction type |
| balance status `processed` | ledger `posted` |
| payment `init` | `initiated` |
| payment `ui` | `requires_action` |
| payment `cancelled`, `failed`, `paid`, `pending` | same canonical spelling |

Unknown legacy values are quarantined in ingestion metadata and reported; they are not
silently coerced. Imports are idempotent by `(tenant, system_key, entity_type,
external_id)` and record an audit entry.

## 11. Transaction, audit and outbox requirements

Every mutation transaction must:

1. set the trusted tenant context;
2. resolve and lock the actor/session and target rows needed for authorization;
3. claim an idempotency key when applicable;
4. validate the legal state transition;
5. write domain rows;
6. append an `audit_log` row containing no secrets and minimal PII;
7. enqueue provider/search/index notifications in `outbox_events`;
8. commit before doing network I/O.

`audit_log` is append-only. Updates/deletes are blocked by a database trigger. Outbox
workers claim rows with `FOR UPDATE SKIP LOCKED`, use provider-level idempotency keys,
increment attempts, and retain a safe error code rather than a provider response that
may contain personal data.

## 12. Minimum production checks before switching adapters on

- Migrate with a dedicated migration role and verify all RLS policies with two tenant
  fixtures in a non-production environment.
- Confirm application role has no `BYPASSRLS`, no schema ownership and no direct
  ability to disable triggers.
- Rotate adapter, lookup-hash, encryption and provider credentials through a secret
  manager; support multiple key versions during rotation.
- Run OTP enumeration, replay, expiry, resend and lockout tests.
- Run OAuth state/nonce/PKCE, identity-collision and account-link takeover tests.
- Run idempotency race tests for project creation, applications, webhooks, referral
  attribution and payouts.
- Run double-entry and reversal tests at transaction commit.
- Exercise data export/deletion, document retention and audit redaction procedures.
- Keep preview/mock storage disabled in production.
