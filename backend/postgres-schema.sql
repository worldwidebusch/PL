-- ProLinker durable data model
-- PostgreSQL 15+
--
-- This schema intentionally contains no seed data, credentials, raw session tokens,
-- raw one-time codes, or example personal data. The application adapter is expected
-- to envelope-encrypt contact fields before persistence and to set app.tenant_id for
-- every request transaction.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION prolinker_public_id(prefix text)
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT lower(prefix) || '_' || replace(gen_random_uuid()::text, '-', '')
$$;

CREATE OR REPLACE FUNCTION prolinker_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('ten'),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  default_locale text NOT NULL DEFAULT 'nl-NL',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (public_id ~ '^ten_[a-z0-9]{32}$')
);

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('usr'),
  role text NOT NULL CHECK (role IN ('freelancer', 'client', 'admin', 'service')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'suspended', 'closed')),
  first_name text,
  last_name text,
  display_name text,
  email_lookup_hash text,
  email_ciphertext bytea,
  email_verified_at timestamptz,
  phone_lookup_hash text,
  phone_ciphertext bytea,
  phone_last4 varchar(4),
  phone_verified_at timestamptz,
  avatar_url text,
  locale text NOT NULL DEFAULT 'nl-NL',
  timezone text,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  CHECK (public_id ~ '^usr_[a-z0-9]{32}$'),
  CHECK (phone_last4 IS NULL OR phone_last4 ~ '^[0-9]{4}$'),
  CHECK ((email_ciphertext IS NULL) = (email_lookup_hash IS NULL)),
  CHECK ((phone_ciphertext IS NULL) = (phone_lookup_hash IS NULL))
);

CREATE UNIQUE INDEX app_users_tenant_email_lookup_uq
  ON app_users (tenant_id, email_lookup_hash)
  WHERE email_lookup_hash IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX app_users_tenant_phone_lookup_uq
  ON app_users (tenant_id, phone_lookup_hash)
  WHERE phone_lookup_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX app_users_tenant_role_status_idx
  ON app_users (tenant_id, role, status) WHERE deleted_at IS NULL;

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  provider text NOT NULL
    CHECK (provider IN ('whatsapp', 'linkedin', 'facebook', 'password')),
  provider_subject text NOT NULL,
  provider_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_email_verified boolean NOT NULL DEFAULT false,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject),
  UNIQUE (tenant_id, user_id, provider),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  CHECK (length(provider_subject) BETWEEN 1 AND 512),
  CHECK (jsonb_typeof(provider_profile) = 'object')
);
CREATE INDEX auth_identities_user_idx ON auth_identities (tenant_id, user_id);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  provider text NOT NULL,
  providers text[] NOT NULL DEFAULT ARRAY[]::text[],
  phone_verified boolean NOT NULL DEFAULT false,
  client_fingerprint_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  CHECK (length(token_hash) >= 32),
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user_active_idx
  ON auth_sessions (tenant_id, user_id, expires_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX auth_sessions_expiry_idx
  ON auth_sessions (expires_at) WHERE revoked_at IS NULL;

CREATE TABLE otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel = 'whatsapp'),
  intent text NOT NULL CHECK (intent IN ('login', 'register')),
  role text NOT NULL CHECK (role IN ('freelancer', 'client')),
  destination_lookup_hash text NOT NULL,
  destination_ciphertext bytea NOT NULL,
  destination_last4 varchar(4) NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 20),
  resend_after_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  next_path text,
  locale text,
  referral_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  registration_profile_ciphertext bytea,
  pending_password_hash text,
  terms_version text,
  privacy_version text,
  consent_accepted_at timestamptz,
  verified_user_id uuid,
  replay_until timestamptz,
  request_ip_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, verified_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  CHECK (destination_last4 ~ '^[0-9]{4}$'),
  CHECK (length(code_hash) >= 32),
  CHECK (expires_at > created_at),
  CHECK (resend_after_at >= created_at),
  CHECK (consumed_at IS NULL OR consumed_at <= updated_at),
  CHECK ((intent = 'login' AND terms_version IS NULL AND privacy_version IS NULL AND consent_accepted_at IS NULL)
      OR (intent = 'register' AND terms_version IS NOT NULL AND privacy_version IS NOT NULL AND consent_accepted_at IS NOT NULL)),
  CHECK (intent = 'register' OR (registration_profile_ciphertext IS NULL AND pending_password_hash IS NULL)),
  CHECK (pending_password_hash IS NULL OR pending_password_hash LIKE '$argon2id$%'),
  CHECK (verified_user_id IS NULL OR consumed_at IS NOT NULL),
  CHECK (replay_until IS NULL OR (consumed_at IS NOT NULL AND replay_until >= consumed_at)),
  CHECK (jsonb_typeof(referral_context) = 'object')
);
CREATE INDEX otp_challenges_destination_active_idx
  ON otp_challenges (tenant_id, destination_lookup_hash, created_at DESC)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;
CREATE INDEX otp_challenges_expiry_idx
  ON otp_challenges (expires_at)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

CREATE TABLE password_credentials (
  user_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  password_hash text NOT NULL,
  algorithm text NOT NULL DEFAULT 'argon2id' CHECK (algorithm = 'argon2id'),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  changed_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  CHECK (length(password_hash) >= 40),
  CHECK (password_hash LIKE '$argon2id$%')
);

CREATE TABLE user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  source text NOT NULL CHECK (source IN ('registration', 'settings', 'migration')),
  ip_hash text,
  user_agent_hash text,
  accepted_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, terms_version, privacy_version),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= accepted_at)
);
CREATE INDEX user_consents_user_idx
  ON user_consents (tenant_id, user_id, accepted_at DESC);

CREATE TABLE external_id_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  system_key text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  external_id text NOT NULL,
  external_partition_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, system_key, entity_type, external_id),
  UNIQUE (tenant_id, system_key, entity_type, entity_id),
  CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX external_id_mappings_entity_idx
  ON external_id_mappings (tenant_id, entity_type, entity_id);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('org'),
  name text NOT NULL,
  legal_name text,
  website_url text,
  industry_key text,
  location_label text,
  country_code varchar(2),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending', 'active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  CHECK (public_id ~ '^org_[a-z0-9]{32}$'),
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')
);
CREATE INDEX organizations_tenant_status_idx
  ON organizations (tenant_id, status) WHERE deleted_at IS NULL;

CREATE TABLE organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'billing')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, user_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, organization_id)
    REFERENCES organizations(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX organization_memberships_user_idx
  ON organization_memberships (tenant_id, user_id, status);

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('pro'),
  kind text NOT NULL CHECK (kind IN ('freelancer', 'client')),
  headline text,
  bio text,
  avatar_url text,
  category_key text,
  subcategory_key text,
  hourly_rate_minor bigint CHECK (hourly_rate_minor IS NULL OR hourly_rate_minor >= 0),
  currency char(3),
  availability_status text
    CHECK (availability_status IS NULL OR availability_status IN ('immediate', 'scheduled', 'unavailable')),
  available_from date,
  hours_available_weekly smallint
    CHECK (hours_available_weekly IS NULL OR hours_available_weekly BETWEEN 0 AND 168),
  years_experience smallint
    CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 80),
  remote_available boolean NOT NULL DEFAULT true,
  location_label text,
  location_key text,
  country_code varchar(2),
  latitude numeric(9,6),
  longitude numeric(9,6),
  searchable boolean NOT NULL DEFAULT true,
  contactable boolean NOT NULL DEFAULT true,
  profile_completeness smallint NOT NULL DEFAULT 0
    CHECK (profile_completeness BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, user_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  CHECK (public_id ~ '^pro_[a-z0-9]{32}$'),
  CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX profiles_search_idx
  ON profiles (tenant_id, kind, category_key, availability_status)
  WHERE searchable AND deleted_at IS NULL;
CREATE INDEX profiles_location_idx
  ON profiles (tenant_id, country_code, location_key)
  WHERE searchable AND deleted_at IS NULL;

CREATE TABLE profile_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  skill_key text NOT NULL,
  label text NOT NULL,
  proficiency smallint CHECK (proficiency IS NULL OR proficiency BETWEEN 1 AND 5),
  years_experience numeric(4,1) CHECK (years_experience IS NULL OR years_experience >= 0),
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, profile_id, skill_key),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id)
    REFERENCES profiles(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX profile_skills_lookup_idx ON profile_skills (tenant_id, skill_key, profile_id);

CREATE TABLE stored_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('doc'),
  document_type text NOT NULL CHECK (document_type IN ('cv', 'portfolio', 'contract', 'invoice', 'other')),
  object_key text NOT NULL,
  original_filename_ciphertext bytea,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 52428800),
  sha256 text NOT NULL,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'scanning', 'extracting', 'ready', 'rejected', 'failed')),
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  retention_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, user_id, sha256),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  CHECK (public_id ~ '^doc_[a-z0-9]{32}$'),
  CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (jsonb_typeof(extracted_data) = 'object')
);
CREATE INDEX stored_documents_processing_idx
  ON stored_documents (tenant_id, processing_status, created_at);

CREATE TABLE profile_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('cv', 'linkedin')),
  document_id uuid,
  identity_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'review', 'applied', 'failed', 'cancelled')),
  selected_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  proposed_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, document_id)
    REFERENCES stored_documents(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, identity_id)
    REFERENCES auth_identities(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((source_type = 'cv' AND document_id IS NOT NULL AND identity_id IS NULL)
      OR (source_type = 'linkedin' AND identity_id IS NOT NULL AND document_id IS NULL)),
  CHECK (jsonb_typeof(proposed_changes) = 'object'),
  CHECK (jsonb_typeof(applied_changes) = 'object')
);
CREATE INDEX profile_imports_user_idx ON profile_imports (tenant_id, user_id, created_at DESC);

CREATE TABLE resume_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN (
    'experience', 'education', 'certification', 'reference', 'language',
    'quality', 'expertise', 'motivation'
  )),
  position smallint NOT NULL DEFAULT 0,
  data jsonb NOT NULL,
  source_import_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id)
    REFERENCES profiles(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, source_import_id)
    REFERENCES profile_imports(tenant_id, id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(data) = 'object')
);
CREATE INDEX resume_entries_profile_idx
  ON resume_entries (tenant_id, profile_id, entry_type, position);

CREATE TABLE portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  title text NOT NULL,
  summary text,
  url text,
  document_id uuid,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, profile_id)
    REFERENCES profiles(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, document_id)
    REFERENCES stored_documents(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX portfolio_items_profile_idx ON portfolio_items (tenant_id, profile_id, position);

CREATE TABLE user_settings (
  user_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  language text NOT NULL DEFAULT 'nl',
  notifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  privacy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(notifications) = 'object'),
  CHECK (jsonb_typeof(privacy) = 'object')
);

CREATE TABLE network_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('inv'),
  inviter_user_id uuid NOT NULL,
  invitee_user_id uuid,
  invitee_name text,
  destination_lookup_hash text,
  destination_ciphertext bytea,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email', 'link')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, inviter_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, invitee_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  CHECK (public_id ~ '^inv_[a-z0-9]{32}$'),
  CHECK (invitee_user_id IS NULL OR invitee_user_id <> inviter_user_id),
  CHECK ((destination_ciphertext IS NULL) = (destination_lookup_hash IS NULL))
);
CREATE INDEX network_invitations_inviter_idx
  ON network_invitations (tenant_id, inviter_user_id, status, created_at DESC);
CREATE INDEX network_invitations_invitee_idx
  ON network_invitations (tenant_id, invitee_user_id, status, created_at DESC)
  WHERE invitee_user_id IS NOT NULL;

CREATE TABLE network_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('con'),
  user_a_id uuid NOT NULL,
  user_b_id uuid NOT NULL,
  invitation_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (tenant_id, user_a_id, user_b_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_a_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_b_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, invitation_id)
    REFERENCES network_invitations(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^con_[a-z0-9]{32}$'),
  CHECK (user_a_id < user_b_id)
);
CREATE INDEX network_connections_a_idx
  ON network_connections (tenant_id, user_a_id, status);
CREATE INDEX network_connections_b_idx
  ON network_connections (tenant_id, user_b_id, status);

CREATE TABLE opportunity_source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text NOT NULL,
  source_url text,
  payload_hash text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ingestion_status text NOT NULL DEFAULT 'new'
    CHECK (ingestion_status IN ('new', 'normalized', 'published', 'rejected', 'expired')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_id),
  UNIQUE (tenant_id, id),
  CHECK (jsonb_typeof(raw_payload) = 'object')
);
CREATE INDEX opportunity_source_records_status_idx
  ON opportunity_source_records (tenant_id, ingestion_status, fetched_at);

CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('opp'),
  source_record_id uuid,
  owner_user_id uuid,
  owner_organization_id uuid,
  source_type text NOT NULL CHECK (source_type IN ('internal', 'partner', 'external')),
  opportunity_type text NOT NULL CHECK (opportunity_type IN ('freelance', 'employment')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'paused', 'closed', 'expired', 'cancelled')),
  title text NOT NULL,
  summary text,
  description text,
  company_name text,
  category_key text,
  subcategory_key text,
  skills text[] NOT NULL DEFAULT ARRAY[]::text[],
  work_mode text NOT NULL DEFAULT 'remote'
    CHECK (work_mode IN ('remote', 'onsite', 'hybrid', 'meet_regular', 'meet_occasional')),
  location_label text,
  location_key text,
  country_code varchar(2),
  latitude numeric(9,6),
  longitude numeric(9,6),
  hours_min smallint CHECK (hours_min IS NULL OR hours_min BETWEEN 0 AND 168),
  hours_max smallint CHECK (hours_max IS NULL OR hours_max BETWEEN 0 AND 168),
  rate_min_minor bigint CHECK (rate_min_minor IS NULL OR rate_min_minor >= 0),
  rate_max_minor bigint CHECK (rate_max_minor IS NULL OR rate_max_minor >= 0),
  budget_type text CHECK (budget_type IS NULL OR budget_type IN ('hourly', 'fixed', 'salary', 'negotiable')),
  currency char(3),
  start_mode text CHECK (start_mode IS NULL OR start_mode IN ('asap', 'scheduled', 'discuss')),
  start_at timestamptz,
  end_at timestamptz,
  duration_weeks integer CHECK (duration_weeks IS NULL OR duration_weeks >= 0),
  posted_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, source_record_id)
    REFERENCES opportunity_source_records(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, owner_organization_id)
    REFERENCES organizations(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^opp_[a-z0-9]{32}$'),
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CHECK (hours_min IS NULL OR hours_max IS NULL OR hours_min <= hours_max),
  CHECK (rate_min_minor IS NULL OR rate_max_minor IS NULL OR rate_min_minor <= rate_max_minor),
  CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at),
  CHECK (jsonb_typeof(source_metadata) = 'object')
);
CREATE INDEX opportunities_feed_idx
  ON opportunities (tenant_id, status, posted_at DESC, id)
  WHERE deleted_at IS NULL;
CREATE INDEX opportunities_type_source_idx
  ON opportunities (tenant_id, opportunity_type, source_type, status, posted_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX opportunities_location_idx
  ON opportunities (tenant_id, country_code, location_key, work_mode)
  WHERE deleted_at IS NULL;
CREATE INDEX opportunities_owner_idx
  ON opportunities (tenant_id, owner_user_id, status, created_at DESC)
  WHERE owner_user_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE opportunity_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  user_id uuid NOT NULL,
  relevance_score numeric(5,2) NOT NULL CHECK (relevance_score BETWEEN 0 AND 100),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, opportunity_id, user_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, opportunity_id)
    REFERENCES opportunities(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(reasons) = 'array')
);
CREATE INDEX opportunity_matches_user_score_idx
  ON opportunity_matches (tenant_id, user_id, relevance_score DESC, computed_at DESC);

CREATE TABLE opportunity_preferences (
  user_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  saved_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, opportunity_id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, opportunity_id)
    REFERENCES opportunities(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX opportunity_preferences_saved_idx
  ON opportunity_preferences (tenant_id, user_id, saved_at DESC)
  WHERE saved_at IS NOT NULL;

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('prj'),
  opportunity_id uuid NOT NULL,
  creator_user_id uuid NOT NULL,
  organization_id uuid,
  status text NOT NULL DEFAULT 'created' CHECK (status IN (
    'draft', 'created', 'refused', 'open', 'paused', 'selection', 'matched',
    'in_progress', 'pending_completion', 'completed', 'auto_closed', 'cancelled'
  )),
  brief jsonb NOT NULL DEFAULT '{}'::jsonb,
  query_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (tenant_id, opportunity_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, opportunity_id)
    REFERENCES opportunities(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, creator_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, organization_id)
    REFERENCES organizations(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^prj_[a-z0-9]{32}$'),
  CHECK (jsonb_typeof(brief) = 'object')
);
CREATE INDEX projects_creator_idx ON projects (tenant_id, creator_user_id, status, created_at DESC);
CREATE INDEX projects_organization_idx
  ON projects (tenant_id, organization_id, status, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE TABLE project_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN (
    'employer', 'agent', 'client', 'invited', 'interested', 'refused', 'assigned'
  )),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_id, user_id, role),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX project_participants_user_idx
  ON project_participants (tenant_id, user_id, role, joined_at DESC);

CREATE TABLE request_idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  scope text NOT NULL,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  state text NOT NULL DEFAULT 'processing'
    CHECK (state IN ('processing', 'completed', 'failed')),
  response_status integer,
  response_body jsonb,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, actor_user_id, scope, idempotency_key),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  CHECK (length(idempotency_key) BETWEEN 8 AND 255),
  CHECK (expires_at > created_at),
  CHECK (response_body IS NULL OR jsonb_typeof(response_body) IN ('object', 'array'))
);
CREATE INDEX request_idempotency_expiry_idx ON request_idempotency_keys (expires_at);

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('app'),
  opportunity_id uuid NOT NULL,
  freelancer_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'draft', 'submitted', 'sending', 'sent', 'delivered', 'viewed', 'interview',
    'offered', 'accepted', 'rejected', 'withdrawn', 'failed', 'cancelled'
  )),
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'agent', 'invitation', 'import')),
  route text NOT NULL DEFAULT 'platform' CHECK (route IN ('platform', 'email', 'whatsapp', 'external')),
  automated boolean NOT NULL DEFAULT false,
  motivation text,
  idempotency_key text,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, opportunity_id, freelancer_user_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, opportunity_id)
    REFERENCES opportunities(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, freelancer_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^app_[a-z0-9]{32}$')
);
CREATE UNIQUE INDEX applications_idempotency_uq
  ON applications (tenant_id, freelancer_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX applications_freelancer_idx
  ON applications (tenant_id, freelancer_user_id, status, created_at DESC);
CREATE INDEX applications_opportunity_idx
  ON applications (tenant_id, opportunity_id, status, created_at DESC);

CREATE TABLE application_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  application_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('platform', 'email', 'whatsapp', 'external')),
  provider text,
  provider_message_id text,
  destination_lookup_hash text,
  destination_ciphertext bytea,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  last_error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_message_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, application_id)
    REFERENCES applications(tenant_id, id) ON DELETE CASCADE,
  CHECK ((destination_ciphertext IS NULL) = (destination_lookup_hash IS NULL))
);
CREATE INDEX application_deliveries_queue_idx
  ON application_deliveries (tenant_id, status, next_attempt_at)
  WHERE status IN ('queued', 'failed');

CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('asg'),
  project_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  application_id uuid,
  client_user_id uuid NOT NULL,
  freelancer_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'matched' CHECK (status IN (
    'matched', 'in_progress', 'pending_completion', 'completed', 'auto_closed', 'cancelled'
  )),
  started_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_id, freelancer_user_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, opportunity_id)
    REFERENCES opportunities(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, application_id)
    REFERENCES applications(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, client_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, freelancer_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^asg_[a-z0-9]{32}$'),
  CHECK (client_user_id <> freelancer_user_id)
);
CREATE INDEX assignments_client_idx
  ON assignments (tenant_id, client_user_id, status, created_at DESC);
CREATE INDEX assignments_freelancer_idx
  ON assignments (tenant_id, freelancer_user_id, status, created_at DESC);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('cvs'),
  subject text,
  context_type text CHECK (context_type IS NULL OR context_type IN ('opportunity', 'project', 'application', 'assignment', 'support')),
  context_id uuid,
  created_by_user_id uuid NOT NULL,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^cvs_[a-z0-9]{32}$')
);
CREATE INDEX conversations_last_message_idx
  ON conversations (tenant_id, last_message_at DESC NULLS LAST, created_at DESC);

CREATE TABLE project_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('pin'),
  project_id uuid NOT NULL,
  inviter_user_id uuid NOT NULL,
  freelancer_user_id uuid NOT NULL,
  conversation_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn', 'expired')),
  channel text NOT NULL DEFAULT 'platform'
    CHECK (channel IN ('platform', 'email', 'whatsapp')),
  message text,
  expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_id, freelancer_user_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, project_id)
    REFERENCES projects(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, inviter_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, freelancer_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^pin_[a-z0-9]{32}$'),
  CHECK (inviter_user_id <> freelancer_user_id),
  CHECK (message IS NULL OR length(message) <= 4000)
);
CREATE INDEX project_invitations_freelancer_idx
  ON project_invitations (tenant_id, freelancer_user_id, status, created_at DESC);
CREATE INDEX project_invitations_inviter_idx
  ON project_invitations (tenant_id, inviter_user_id, status, created_at DESC);

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz,
  archived_at timestamptz,
  muted_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, conversation_id, user_id),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX conversation_participants_user_idx
  ON conversation_participants (tenant_id, user_id, archived_at, updated_at DESC);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('msg'),
  conversation_id uuid NOT NULL,
  author_user_id uuid NOT NULL,
  reply_to_message_id uuid,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'failed', 'deleted')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES conversations(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, author_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reply_to_message_id)
    REFERENCES messages(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^msg_[a-z0-9]{32}$'),
  CHECK (length(body) BETWEEN 1 AND 10000)
);
CREATE INDEX messages_conversation_idx
  ON messages (tenant_id, conversation_id, sent_at DESC, id)
  WHERE deleted_at IS NULL;

CREATE TABLE message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  message_id uuid NOT NULL,
  document_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, message_id, document_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, message_id)
    REFERENCES messages(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, document_id)
    REFERENCES stored_documents(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE referral_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('ref'),
  share_id text NOT NULL,
  referrer_user_id uuid NOT NULL,
  token_hash text,
  token_hint varchar(8),
  entity_type text CHECK (entity_type IS NULL OR entity_type IN ('platform', 'opportunity', 'profile', 'project')),
  entity_id uuid,
  campaign text,
  channel text,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, share_id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, referrer_user_id),
  FOREIGN KEY (tenant_id, referrer_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE CASCADE,
  CHECK (public_id ~ '^ref_[a-z0-9]{32}$'),
  CHECK (share_id ~ '^shr_[A-Za-z0-9_-]{12,80}$'),
  CHECK (token_hash IS NULL OR length(token_hash) >= 32),
  CHECK (token_hint IS NULL OR length(token_hint) BETWEEN 2 AND 8)
);
CREATE UNIQUE INDEX referral_links_token_hash_uq
  ON referral_links (tenant_id, token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX referral_links_referrer_idx
  ON referral_links (tenant_id, referrer_user_id, created_at DESC);

CREATE TABLE referral_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  link_id uuid NOT NULL,
  visitor_key_hash text,
  landing_path text,
  user_agent_hash text,
  ip_hash text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, link_id),
  FOREIGN KEY (tenant_id, link_id)
    REFERENCES referral_links(tenant_id, id) ON DELETE CASCADE,
  CHECK (visitor_key_hash IS NULL OR length(visitor_key_hash) >= 32),
  CHECK (expires_at > captured_at)
);
CREATE UNIQUE INDEX referral_captures_first_touch_uq
  ON referral_captures (tenant_id, visitor_key_hash)
  WHERE visitor_key_hash IS NOT NULL;
CREATE INDEX referral_captures_link_idx
  ON referral_captures (tenant_id, link_id, captured_at DESC);

CREATE TABLE referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  link_id uuid NOT NULL,
  capture_id uuid,
  actor_user_id uuid,
  event_type text NOT NULL CHECK (event_type IN (
    'share', 'click', 'capture', 'registration', 'application', 'hire', 'settlement'
  )),
  entity_type text,
  entity_id uuid,
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, link_id)
    REFERENCES referral_links(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, capture_id)
    REFERENCES referral_captures(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE UNIQUE INDEX referral_events_idempotency_uq
  ON referral_events (tenant_id, link_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX referral_events_link_idx
  ON referral_events (tenant_id, link_id, occurred_at DESC);

CREATE TABLE referral_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  link_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  referrer_user_id uuid NOT NULL,
  referred_user_id uuid NOT NULL,
  attribution_model text NOT NULL DEFAULT 'first_touch'
    CHECK (attribution_model = 'first_touch'),
  attributed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, referred_user_id),
  UNIQUE (tenant_id, capture_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, link_id, referrer_user_id)
    REFERENCES referral_links(tenant_id, id, referrer_user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, capture_id, link_id)
    REFERENCES referral_captures(tenant_id, id, link_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, referred_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  CHECK (referrer_user_id <> referred_user_id)
);
CREATE INDEX referral_attributions_referrer_idx
  ON referral_attributions (tenant_id, referrer_user_id, attributed_at DESC);

CREATE TABLE ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('lac'),
  owner_user_id uuid,
  owner_organization_id uuid,
  account_code text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, account_code, currency),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, owner_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, owner_organization_id)
    REFERENCES organizations(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^lac_[a-z0-9]{32}$'),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (NOT (owner_user_id IS NOT NULL AND owner_organization_id IS NOT NULL))
);
CREATE INDEX ledger_accounts_user_idx
  ON ledger_accounts (tenant_id, owner_user_id, currency) WHERE owner_user_id IS NOT NULL;
CREATE INDEX ledger_accounts_org_idx
  ON ledger_accounts (tenant_id, owner_organization_id, currency) WHERE owner_organization_id IS NOT NULL;

CREATE TABLE ledger_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('ltx'),
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'deposit', 'transfer_out', 'transfer_in', 'withdrawal', 'project_payment',
    'platform_fee', 'referral_reward', 'refund', 'adjustment'
  )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'posted', 'voided', 'failed')),
  reference_type text,
  reference_id uuid,
  description text,
  idempotency_key text,
  effective_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (public_id ~ '^ltx_[a-z0-9]{32}$'),
  CHECK ((status = 'posted') = (posted_at IS NOT NULL))
);
CREATE UNIQUE INDEX ledger_transactions_idempotency_uq
  ON ledger_transactions (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX ledger_transactions_status_idx
  ON ledger_transactions (tenant_id, status, effective_at DESC);

CREATE TABLE ledger_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  transaction_id uuid NOT NULL,
  account_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, transaction_id)
    REFERENCES ledger_transactions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, account_id)
    REFERENCES ledger_accounts(tenant_id, id) ON DELETE RESTRICT,
  CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX ledger_postings_transaction_idx
  ON ledger_postings (tenant_id, transaction_id);
CREATE INDEX ledger_postings_account_idx
  ON ledger_postings (tenant_id, account_id, created_at DESC);

CREATE OR REPLACE FUNCTION prolinker_guard_posted_ledger_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'posted ledger transactions are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_transactions_immutable_when_posted
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION prolinker_guard_posted_ledger_transaction();

CREATE OR REPLACE FUNCTION prolinker_guard_posted_ledger_posting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid;
  v_transaction uuid;
  v_status text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT status INTO v_status
    FROM ledger_transactions
    WHERE tenant_id = OLD.tenant_id AND id = OLD.transaction_id;
    IF v_status = 'posted' THEN
      RAISE EXCEPTION 'postings of a posted ledger transaction are immutable';
    END IF;
  END IF;

  v_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  v_transaction := CASE WHEN TG_OP = 'DELETE' THEN OLD.transaction_id ELSE NEW.transaction_id END;
  SELECT status INTO v_status
  FROM ledger_transactions
  WHERE tenant_id = v_tenant AND id = v_transaction;
  IF v_status = 'posted' THEN
    RAISE EXCEPTION 'postings of a posted ledger transaction are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_postings_immutable_when_posted
BEFORE INSERT OR UPDATE OR DELETE ON ledger_postings
FOR EACH ROW EXECUTE FUNCTION prolinker_guard_posted_ledger_posting();

CREATE OR REPLACE FUNCTION prolinker_assert_balanced_transaction()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid;
  v_transaction uuid;
  v_status text;
  v_count integer;
  v_balance numeric;
  v_currencies integer;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_transaction := COALESCE(NEW.id, OLD.id);
  ELSE
    v_tenant := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_transaction := COALESCE(NEW.transaction_id, OLD.transaction_id);
  END IF;

  SELECT status INTO v_status
  FROM ledger_transactions
  WHERE tenant_id = v_tenant AND id = v_transaction;

  IF NOT FOUND OR v_status <> 'posted' THEN
    RETURN NULL;
  END IF;

  SELECT count(*),
         COALESCE(sum(CASE WHEN direction = 'debit' THEN amount_minor ELSE -amount_minor END), 0),
         count(DISTINCT currency)
    INTO v_count, v_balance, v_currencies
  FROM ledger_postings
  WHERE tenant_id = v_tenant AND transaction_id = v_transaction;

  IF v_count < 2 OR v_balance <> 0 OR v_currencies <> 1 THEN
    RAISE EXCEPTION 'posted ledger transaction % must contain at least two balanced postings in one currency', v_transaction;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_postings_balance_check
AFTER INSERT OR UPDATE OR DELETE ON ledger_postings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION prolinker_assert_balanced_transaction();

CREATE CONSTRAINT TRIGGER ledger_transactions_balance_check
AFTER INSERT OR UPDATE ON ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION prolinker_assert_balanced_transaction();

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('pay'),
  payer_user_id uuid,
  payee_user_id uuid,
  assignment_id uuid,
  provider text,
  provider_payment_id text,
  status text NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated', 'pending', 'requires_action', 'cancelled', 'failed', 'paid', 'refunded')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  settlement_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  UNIQUE (tenant_id, provider, provider_payment_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, payer_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, payee_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assignment_id)
    REFERENCES assignments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, settlement_transaction_id)
    REFERENCES ledger_transactions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^pay_[a-z0-9]{32}$'),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (payer_user_id IS NULL OR payee_user_id IS NULL OR payer_user_id <> payee_user_id)
);
CREATE INDEX payments_user_idx
  ON payments (tenant_id, payee_user_id, status, created_at DESC)
  WHERE payee_user_id IS NOT NULL;
CREATE INDEX payments_assignment_idx
  ON payments (tenant_id, assignment_id, created_at DESC)
  WHERE assignment_id IS NOT NULL;

CREATE TABLE payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status text NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processed', 'ignored', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_event_id),
  UNIQUE (tenant_id, id),
  CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX payment_provider_events_queue_idx
  ON payment_provider_events (tenant_id, processing_status, received_at);

CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  public_id text NOT NULL UNIQUE DEFAULT prolinker_public_id('pot'),
  user_id uuid NOT NULL,
  provider text,
  provider_payout_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  ledger_transaction_id uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_payout_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, ledger_transaction_id)
    REFERENCES ledger_transactions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (public_id ~ '^pot_[a-z0-9]{32}$'),
  CHECK (currency ~ '^[A-Z]{3}$')
);
CREATE INDEX payouts_user_idx ON payouts (tenant_id, user_id, status, requested_at DESC);

CREATE TABLE referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  attribution_id uuid NOT NULL,
  beneficiary_user_id uuid NOT NULL,
  assignment_id uuid NOT NULL,
  basis_amount_minor bigint NOT NULL CHECK (basis_amount_minor >= 0),
  rate_basis_points integer NOT NULL DEFAULT 200 CHECK (rate_basis_points BETWEEN 0 AND 10000),
  reward_amount_minor bigint NOT NULL CHECK (reward_amount_minor >= 0),
  currency char(3) NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'earned', 'payable', 'paid', 'reversed', 'expired')),
  settlement_transaction_id uuid,
  earned_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, attribution_id, assignment_id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, attribution_id)
    REFERENCES referral_attributions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, beneficiary_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assignment_id)
    REFERENCES assignments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, settlement_transaction_id)
    REFERENCES ledger_transactions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (
    reward_amount_minor = round((basis_amount_minor::numeric * rate_basis_points::numeric) / 10000)::bigint
  )
);
CREATE INDEX referral_rewards_beneficiary_idx
  ON referral_rewards (tenant_id, beneficiary_user_id, status, created_at DESC);

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  topic text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  idempotency_key text NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, topic, idempotency_key),
  UNIQUE (tenant_id, id),
  CHECK (jsonb_typeof(payload) = 'object')
);
CREATE INDEX outbox_events_queue_idx
  ON outbox_events (available_at, created_at)
  WHERE published_at IS NULL;

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  request_id text,
  actor_user_id uuid,
  actor_type text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'service', 'system')),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES app_users(tenant_id, id) ON DELETE RESTRICT,
  CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'),
  CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object'),
  CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE INDEX audit_log_entity_idx
  ON audit_log (tenant_id, entity_type, entity_id, occurred_at DESC);
CREATE INDEX audit_log_actor_idx
  ON audit_log (tenant_id, actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX audit_log_request_idx
  ON audit_log (tenant_id, request_id) WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prolinker_audit_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prolinker_audit_log_immutable();

-- Keep mutable records' updated_at values server-controlled.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenants', 'app_users', 'auth_identities', 'auth_sessions', 'otp_challenges',
    'password_credentials', 'user_consents', 'external_id_mappings',
    'organizations', 'organization_memberships', 'profiles',
    'profile_skills', 'stored_documents', 'profile_imports', 'resume_entries',
    'portfolio_items', 'user_settings', 'network_invitations', 'network_connections',
    'opportunity_source_records', 'opportunities', 'opportunity_matches',
    'opportunity_preferences', 'projects', 'project_participants',
    'request_idempotency_keys', 'applications', 'application_deliveries', 'assignments',
    'conversations', 'project_invitations', 'conversation_participants', 'messages', 'referral_links',
    'referral_captures', 'referral_attributions', 'ledger_accounts',
    'ledger_transactions', 'payments', 'payment_provider_events', 'payouts',
    'referral_rewards', 'outbox_events'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION prolinker_set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END;
$$;

-- Tenant isolation. Runtime transactions must first execute:
--   SELECT set_config('app.tenant_id', $1, true);
-- The migration/owner role must not be used by the application.
CREATE OR REPLACE FUNCTION prolinker_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'app_users', 'auth_identities', 'auth_sessions', 'otp_challenges',
    'password_credentials', 'user_consents', 'external_id_mappings',
    'organizations', 'organization_memberships', 'profiles',
    'profile_skills', 'stored_documents', 'profile_imports', 'resume_entries',
    'portfolio_items', 'user_settings', 'network_invitations', 'network_connections',
    'opportunity_source_records', 'opportunities', 'opportunity_matches',
    'opportunity_preferences', 'projects', 'project_participants',
    'request_idempotency_keys', 'applications', 'application_deliveries', 'assignments',
    'conversations', 'project_invitations', 'conversation_participants', 'messages', 'message_attachments',
    'referral_links', 'referral_captures', 'referral_events', 'referral_attributions',
    'ledger_accounts', 'ledger_transactions', 'ledger_postings', 'payments',
    'payment_provider_events', 'payouts', 'referral_rewards', 'outbox_events', 'audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I_tenant_isolation ON %I USING (tenant_id = prolinker_current_tenant_id()) WITH CHECK (tenant_id = prolinker_current_tenant_id())',
      table_name, table_name
    );
  END LOOP;
END;
$$;

COMMIT;
