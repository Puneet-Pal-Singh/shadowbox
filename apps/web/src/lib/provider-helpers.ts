import type { BYOKCredential } from "@repo/shared-types";

export function findCredentialByProviderId(
  credentials: BYOKCredential[],
  providerId: string
): BYOKCredential | undefined {
  return credentials.find((item) => item.providerId === providerId);
}
