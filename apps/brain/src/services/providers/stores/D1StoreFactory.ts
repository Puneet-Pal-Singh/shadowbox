/**
 * D1 Store Factory
 *
 * Creates D1-backed provider stores with proper scope injection.
 * This is the entry point for creating scoped store instances.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { CredentialStore } from "./CredentialStore";
import type { PreferenceStore } from "./PreferenceStore";
import type { ProviderModelCacheStore } from "./ProviderModelCacheStore";
import { D1CredentialStore } from "./D1CredentialStore";
import { D1PreferenceStore } from "./D1PreferenceStore";
import { D1ProviderModelCacheStore } from "./D1ProviderModelCacheStore";

export interface D1StoreFactoryOptions {
  userId: string;
  workspaceId?: string;
  masterKey: string;
  keyVersion: string;
  previousKeyVersion?: string;
}

/**
 * Create a D1-backed credential store
 */
export function createCredentialStore(
  db: D1Database,
  options: D1StoreFactoryOptions,
): CredentialStore {
  return new D1CredentialStore(
    db,
    options.userId,
    options.masterKey,
    options.keyVersion,
    options.previousKeyVersion,
  );
}

/**
 * Create a D1-backed preference store
 */
export function createPreferenceStore(
  db: D1Database,
  options: D1StoreFactoryOptions,
): PreferenceStore {
  if (!options.workspaceId) {
    throw new Error("workspaceId is required for PreferenceStore");
  }
  return new D1PreferenceStore(db, options.userId, options.workspaceId);
}

/**
 * Create a D1-backed model cache store (global/shared)
 */
export function createModelCacheStore(db: D1Database): ProviderModelCacheStore {
  return new D1ProviderModelCacheStore(db);
}

/**
 * Create all D1-backed stores for a given scope
 */
export function createD1Stores(
  db: D1Database,
  options: D1StoreFactoryOptions,
): {
  credentialStore: CredentialStore;
  preferenceStore: PreferenceStore;
  modelCacheStore: ProviderModelCacheStore;
} {
  return {
    credentialStore: createCredentialStore(db, options),
    preferenceStore: createPreferenceStore(db, options),
    modelCacheStore: createModelCacheStore(db),
  };
}

/**
 * Extract encryption keys from environment
 * Note: This is a helper - the actual env type comes from the caller
 */
export function getEncryptionConfig(env: Record<string, unknown>): {
  masterKey: string;
  keyVersion: string;
  previousKeyVersion: string | undefined;
} {
  const masterKey = env.BYOK_CREDENTIAL_ENCRYPTION_KEY as string | undefined;
  const keyVersion =
    (env.BYOK_CREDENTIAL_ENCRYPTION_KEY_VERSION as string) || "v1";
  const previousKeyVersion =
    env.BYOK_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION as string | undefined;

  if (!masterKey) {
    throw new Error("BYOK_CREDENTIAL_ENCRYPTION_KEY is not configured");
  }

  return {
    masterKey,
    keyVersion,
    previousKeyVersion,
  };
}
