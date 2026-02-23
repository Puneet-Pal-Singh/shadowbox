/**
 * BYOK Vault Services
 *
 * Exports for credential encryption, storage, repository, coordination, and resolution.
 */

export {
  EncryptedSecretSchema,
  CredentialEncryptionService,
  type EncryptedSecret,
  type EncryptionOptions,
  type DecryptionOptions,
} from "./encryption.js";

export {
  ProviderVaultRepository,
  type IDatabase,
  type PreparedStatement,
  type BoundStatement,
} from "./repository.js";

export {
  ProviderVaultCoordinatorDO,
  type CoordinatorMutation,
  type CoordinatorResponse,
} from "./coordinator.js";

export {
  ProviderResolutionService,
  type ResolutionContext,
  type PlatformDefaults,
} from "./resolution.js";

export {
  BYOK_CREDENTIALS_SCHEMA,
  BYOK_PREFERENCES_SCHEMA,
  BYOK_AUDIT_EVENTS_SCHEMA,
  PROVIDER_REGISTRY_CACHE_SCHEMA,
  ALL_BYOK_MIGRATIONS,
} from "./schema.js";
