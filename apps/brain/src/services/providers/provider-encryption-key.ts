import type { Env } from "../../types/ai";

export interface ProviderEncryptionKeyVersion {
  version: string;
  key: string;
}

export interface ProviderEncryptionConfig {
  current: ProviderEncryptionKeyVersion;
  previous?: ProviderEncryptionKeyVersion;
}

export function readByokEncryptionKey(env: Env): string | undefined {
  return readByokEncryptionConfig(env)?.current.key;
}

export function readByokEncryptionConfig(
  env: Env,
): ProviderEncryptionConfig | undefined {
  const candidate = env.BYOK_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!candidate) {
    return undefined;
  }

  const currentVersion =
    env.BYOK_CREDENTIAL_ENCRYPTION_KEY_VERSION?.trim() || "v1";
  const previousKey = env.BYOK_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS?.trim();
  const previousVersion =
    env.BYOK_CREDENTIAL_ENCRYPTION_KEY_PREVIOUS_VERSION?.trim();

  return {
    current: {
      version: currentVersion,
      key: candidate,
    },
    previous: resolvePreviousVersion(previousKey, previousVersion),
  };
}

function resolvePreviousVersion(
  key?: string,
  version?: string,
): ProviderEncryptionKeyVersion | undefined {
  if (!key) {
    return undefined;
  }
  return {
    key,
    version: version || "v0",
  };
}
