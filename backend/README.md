# ProLinker backend handoff

The browser and Netlify functions do not connect directly to PostgreSQL or to
legacy staging services. They call one private adapter endpoint through
`PROLINKER_BACKEND_ADAPTER_URL`. This keeps database credentials, provider
tokens and legacy JWT keys outside the public deployment.

Use these two files as the implementation boundary:

- `postgres-schema.sql` is the PostgreSQL 15 baseline for accounts, identities,
  OTP challenges, sessions, profiles, work, messages, referrals, finance,
  idempotency, outbox delivery, auditing and legacy ID mappings.
- `adapter-contract.md` defines every private operation, request/response shape,
  authorization rule, staging translation and transaction requirement.

## Database setup

Create a dedicated database and apply the schema with a migration principal:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/postgres-schema.sql
```

The schema intentionally does not contain application secrets or provider
credentials. Configure lookup peppers, encryption keys, WhatsApp credentials,
social OAuth secrets and legacy service JWT keys in the adapter service's
secret manager.

## Adapter setup

Deploy an internal HTTPS service with a single authenticated POST endpoint. It
must validate `Authorization: Bearer <token>`, reject unknown operations and
implement the envelopes in `adapter-contract.md`. Configure its public-to-
Netlify boundary in the Netlify environment:

```text
PROLINKER_BACKEND_ADAPTER_URL=https://internal-api.example/adapter
PROLINKER_BACKEND_ADAPTER_TOKEN=<secret shared only with the adapter>
```

The adapter may connect directly to the new PostgreSQL schema, translate to the
legacy staging services, or do both during migration. Legacy external IDs belong
in the mapping tables; they never replace ProLinker's canonical IDs.

Production readiness requires applying the SQL to a real PostgreSQL instance,
implementing the private adapter operations and running end-to-end provider tests
with sandbox WhatsApp, LinkedIn and Facebook credentials. Local preview auth and
local mock records are not production storage.
