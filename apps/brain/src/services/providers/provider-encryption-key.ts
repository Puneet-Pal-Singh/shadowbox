import type { Env } from "../../types/ai";

export function readByokEncryptionKey(env: Env): string | undefined {
  const candidate = env.BYOK_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!candidate) {
    return undefined;
  }
  return candidate;
}
