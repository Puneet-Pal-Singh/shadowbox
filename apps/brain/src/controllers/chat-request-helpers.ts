import type { AgentType } from "@shadowbox/execution-engine/runtime";
import { ValidationError } from "../domain/errors";

const SAFE_IDENTIFIER_REGEX = /^[A-Za-z0-9-]+$/;
const SAFE_SCOPE_IDENTIFIER_REGEX = /^[A-Za-z0-9._:-]+$/;
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function extractIdentifiers(
  body: {
    sessionId?: string;
    runId?: string;
  },
  correlationId?: string,
): {
  sessionId: string;
  runId: string;
} {
  const sessionId = parseRequiredIdentifier(
    body.sessionId,
    "sessionId",
    correlationId,
  );
  const runId = parseRunId(body.runId, correlationId);

  return {
    sessionId,
    runId,
  };
}

export function parseOptionalScopeIdentifier(
  identifier: string | null,
  fieldName: string,
  correlationId?: string,
): string | undefined {
  if (!identifier) {
    return undefined;
  }
  const normalized = identifier.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.length > 128) {
    throw new ValidationError(
      `Invalid ${fieldName}: too long (max 128 characters)`,
      "IDENTIFIER_TOO_LONG",
      correlationId,
    );
  }
  if (!SAFE_SCOPE_IDENTIFIER_REGEX.test(normalized)) {
    throw new ValidationError(
      `Invalid ${fieldName}: contains unsupported characters`,
      "INVALID_IDENTIFIER_FORMAT",
      correlationId,
    );
  }
  return normalized;
}

export function mapAgentIdToType(
  agentId?: string,
  correlationId?: string,
): AgentType {
  if (!agentId) {
    return "coding";
  }

  const agentTypeMap: Record<string, AgentType> = {
    review: "review",
    ci: "ci",
    coding: "coding",
  };
  const mapped = agentTypeMap[agentId];
  if (!mapped) {
    throw new ValidationError(
      `Unsupported agentId: ${agentId}`,
      "INVALID_AGENT_TYPE",
      correlationId,
    );
  }

  return mapped;
}

function parseRunId(runId?: string, correlationId?: string): string {
  if (!runId || runId.trim().length === 0) {
    throw new ValidationError(
      "Missing required field: runId",
      "MISSING_FIELD",
      correlationId,
    );
  }
  const normalized = runId.trim();
  if (!UUID_V4_REGEX.test(normalized)) {
    throw new ValidationError(
      "Invalid runId: expected UUID v4 format",
      "INVALID_RUN_ID",
      correlationId,
    );
  }
  return normalized;
}

function parseRequiredIdentifier(
  identifier: string | undefined,
  fieldName: string,
  correlationId?: string,
): string {
  if (!identifier || identifier.trim().length === 0) {
    throw new ValidationError(
      `Missing required field: ${fieldName}`,
      "MISSING_FIELD",
      correlationId,
    );
  }

  const normalized = identifier.trim();
  if (normalized.length > 128) {
    throw new ValidationError(
      `Invalid ${fieldName}: too long (max 128 characters)`,
      "IDENTIFIER_TOO_LONG",
      correlationId,
    );
  }
  if (!SAFE_IDENTIFIER_REGEX.test(normalized)) {
    throw new ValidationError(
      `Invalid ${fieldName}: only letters, numbers, and hyphens allowed`,
      "INVALID_IDENTIFIER_FORMAT",
      correlationId,
    );
  }
  return normalized;
}
