/**
 * D1 Schema Definitions for BYOK
 *
 * Defines the SQL schema for credential storage, preferences, and audit events.
 * Supports encryption at rest with key versioning for rotation.
 */

/**
 * D1 Migration: Create BYOK credentials table
 *
 * Stores encrypted API keys with metadata for lifecycle management.
 * Uses soft deletes (deletedAt) to support recovery and auditing.
 */
export const BYOK_CREDENTIALS_SCHEMA = `
CREATE TABLE IF NOT EXISTS byok_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  label TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  encrypted_secret_json TEXT NOT NULL,
  key_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected',
  last_validated_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_byok_cred_scope_label
  ON byok_credentials(user_id, workspace_id, provider_id, label)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_byok_cred_scope_provider
  ON byok_credentials(user_id, workspace_id, provider_id);

CREATE INDEX IF NOT EXISTS ix_byok_cred_scope_status
  ON byok_credentials(user_id, workspace_id, status);

CREATE INDEX IF NOT EXISTS ix_byok_cred_created_at
  ON byok_credentials(created_at DESC);
`;

/**
 * D1 Migration: Create BYOK preferences table
 *
 * Stores workspace-level default provider and fallback chain configuration.
 * Primary key is (user_id, workspace_id) for one set of prefs per workspace.
 */
export const BYOK_PREFERENCES_SCHEMA = `
CREATE TABLE IF NOT EXISTS byok_preferences (
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  default_provider_id TEXT,
  default_credential_id TEXT,
  default_model_id TEXT,
  fallback_mode TEXT NOT NULL DEFAULT 'strict',
  fallback_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, workspace_id)
);
`;

/**
 * D1 Migration: Create BYOK audit events table
 *
 * Immutable audit trail for compliance and debugging.
 * Records connect, validate, disconnect, preference updates, and resolution events.
 */
export const BYOK_AUDIT_EVENTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS byok_audit_events (
  event_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  provider_id TEXT,
  credential_id TEXT,
  operation TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_byok_audit_scope_time
  ON byok_audit_events(user_id, workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_byok_audit_operation
  ON byok_audit_events(operation, created_at DESC);
`;

/**
 * D1 Migration: Create provider registry cache table
 *
 * Caches provider metadata to reduce remote fetches.
 * Not strictly required in Phase 1 (builtin providers), but prepared for Phase 2.
 */
export const PROVIDER_REGISTRY_CACHE_SCHEMA = `
CREATE TABLE IF NOT EXISTS provider_registry_cache (
  provider_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  auth_modes_json TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  models_json TEXT NOT NULL,
  source_version TEXT NOT NULL,
  refreshed_at TEXT NOT NULL
);
`;

/**
 * All migrations to run on D1 initialization
 */
export const ALL_BYOK_MIGRATIONS = [
  BYOK_CREDENTIALS_SCHEMA,
  BYOK_PREFERENCES_SCHEMA,
  BYOK_AUDIT_EVENTS_SCHEMA,
  PROVIDER_REGISTRY_CACHE_SCHEMA,
];
