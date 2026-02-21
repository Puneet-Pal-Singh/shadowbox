/**
 * Provider scope helpers.
 *
 * Single Responsibility: Normalize provider credential scope values for
 * storage key generation and migration compatibility.
 */

import type { ProviderStoreScopeInput } from "../../types/provider-scope";
export type { ProviderStoreScopeInput } from "../../types/provider-scope";

export interface ProviderStoreScope {
  runId: string;
  userId: string;
  workspaceId: string;
  usedDerivedUserScope: boolean;
  usedDerivedWorkspaceScope: boolean;
}

const DEFAULT_WORKSPACE_ID = "default";
const RUN_SCOPED_USER_PREFIX = "run";

export function normalizeProviderScope(
  scope: ProviderStoreScopeInput,
): ProviderStoreScope {
  const userId = normalizeIdentifier(scope.userId);
  const workspaceId = normalizeIdentifier(scope.workspaceId);

  const resolvedUserId =
    userId.length > 0 ? userId : `${RUN_SCOPED_USER_PREFIX}-${scope.runId}`;
  const resolvedWorkspaceId =
    workspaceId.length > 0 ? workspaceId : DEFAULT_WORKSPACE_ID;

  return {
    runId: scope.runId,
    userId: resolvedUserId,
    workspaceId: resolvedWorkspaceId,
    usedDerivedUserScope: userId.length === 0,
    usedDerivedWorkspaceScope: workspaceId.length === 0,
  };
}

export function sanitizeScopeSegment(value: string): string {
  return encodeURIComponent(value);
}

function normalizeIdentifier(value?: string): string {
  if (!value) {
    return "";
  }
  return value.trim();
}
