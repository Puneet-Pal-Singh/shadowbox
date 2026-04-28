import type { RunMode, WorkflowIntent } from "@repo/shared-types";
import { DomainError } from "../domain/errors";
import type { Env } from "../types/ai";

const DEFAULT_RUN_SUBMISSION_LIMIT = 20;
const DEFAULT_RUN_SUBMISSION_WINDOW_SECONDS = 60;
const DEFAULT_MUTATION_RUN_SUBMISSION_LIMIT = 8;
const DEFAULT_MUTATION_RUN_SUBMISSION_WINDOW_SECONDS = 60;

interface RunAdmissionInput {
  userId?: string;
  workspaceId?: string;
  clientFingerprint?: string;
  mode?: RunMode;
  workflowIntent?: WorkflowIntent;
}

interface ResolvedLimit {
  bucket: "run_submission" | "mutation_run_submission";
  limit: number;
  windowSeconds: number;
}

interface AdmissionDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * RunAdmissionService
 * Single Responsibility: enforce launch-safety run admission guardrails.
 */
export class RunAdmissionService {
  constructor(private readonly env: Env) {}

  async enforce(
    input: RunAdmissionInput,
    correlationId: string,
  ): Promise<void> {
    this.enforceEmergencyShutoff(correlationId);
    await this.enforceRateLimit(input, correlationId);
  }

  private enforceEmergencyShutoff(correlationId: string): void {
    const mode = this.env.LAUNCH_EMERGENCY_SHUTOFF_MODE?.trim().toLowerCase();
    if (mode !== "block_runs") {
      return;
    }

    throw new DomainError(
      "EMERGENCY_SHUTOFF_ACTIVE",
      "LegionCode is temporarily in maintenance mode while launch traffic is being stabilized. Please try again shortly.",
      503,
      true,
      correlationId,
      { mode: "block_runs" },
    );
  }

  private async enforceRateLimit(
    input: RunAdmissionInput,
    correlationId: string,
  ): Promise<void> {
    const limit = this.resolveLimit(input);
    const decision = await this.requestAdmission(limit, input, correlationId);

    if (!decision.allowed) {
      throw new DomainError(
        "RUN_SUBMISSION_RATE_LIMITED",
        `Run submission rate limit reached. Retry in ${decision.retryAfterSeconds}s.`,
        429,
        true,
        correlationId,
        {
          bucket: limit.bucket,
          limit: limit.limit,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
      );
    }
  }

  private resolveLimit(input: RunAdmissionInput): ResolvedLimit {
    const mutationCapable = this.isMutationCapable(input);
    if (mutationCapable) {
      return {
        bucket: "mutation_run_submission",
        limit: readPositiveInt(
          this.env.MUTATION_RUN_SUBMISSION_RATE_LIMIT_MAX,
          DEFAULT_MUTATION_RUN_SUBMISSION_LIMIT,
        ),
        windowSeconds: readPositiveInt(
          this.env.MUTATION_RUN_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS,
          DEFAULT_MUTATION_RUN_SUBMISSION_WINDOW_SECONDS,
        ),
      };
    }

    return {
      bucket: "run_submission",
      limit: readPositiveInt(
        this.env.RUN_SUBMISSION_RATE_LIMIT_MAX,
        DEFAULT_RUN_SUBMISSION_LIMIT,
      ),
      windowSeconds: readPositiveInt(
        this.env.RUN_SUBMISSION_RATE_LIMIT_WINDOW_SECONDS,
        DEFAULT_RUN_SUBMISSION_WINDOW_SECONDS,
      ),
    };
  }

  private isMutationCapable(input: RunAdmissionInput): boolean {
    if (input.mode === "plan") {
      return false;
    }
    if (input.workflowIntent === "explore" || input.workflowIntent === "review") {
      return false;
    }
    return true;
  }

  private async requestAdmission(
    limit: ResolvedLimit,
    input: RunAdmissionInput,
    correlationId: string,
  ): Promise<AdmissionDecision> {
    if (!this.env.RUN_ADMISSION_LIMITER) {
      throw new DomainError(
        "RUN_ADMISSION_LIMITER_UNAVAILABLE",
        "Run admission limiter is unavailable. Please retry shortly.",
        503,
        true,
        correlationId,
      );
    }

    const scope = this.buildScope(input);
    const id = this.env.RUN_ADMISSION_LIMITER.idFromName(scope);
    const stub = this.env.RUN_ADMISSION_LIMITER.get(id);
    const response = await stub.fetch("https://run-admission-limiter/enforce", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bucket: limit.bucket,
        limit: limit.limit,
        windowSeconds: limit.windowSeconds,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new DomainError(
        "RUN_ADMISSION_LIMITER_UNAVAILABLE",
        `Run admission limiter request failed (${response.status}).`,
        503,
        true,
        correlationId,
        {
          limiterStatus: response.status,
          limiterError: errorText,
        },
      );
    }

    const body = (await response.json()) as unknown;
    if (!isAdmissionDecision(body)) {
      throw new DomainError(
        "RUN_ADMISSION_LIMITER_INVALID_RESPONSE",
        "Run admission limiter returned an invalid response.",
        503,
        true,
        correlationId,
      );
    }

    return body;
  }

  private buildScope(input: RunAdmissionInput): string {
    const userId = normalizeScopeValue(input.userId);
    const workspaceId = normalizeScopeValue(input.workspaceId);
    if (userId === "unknown" || workspaceId === "unknown") {
      const fallbackFingerprint = normalizeScopeValue(input.clientFingerprint);
      return `user:${userId}:workspace:${workspaceId}:fingerprint:${fallbackFingerprint}`;
    }
    return `user:${userId}:workspace:${workspaceId}`;
  }
}

function readPositiveInt(value: string | undefined | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeScopeValue(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "unknown";
}

function isAdmissionDecision(value: unknown): value is AdmissionDecision {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.allowed === "boolean" &&
    typeof candidate.retryAfterSeconds === "number" &&
    Number.isFinite(candidate.retryAfterSeconds) &&
    candidate.retryAfterSeconds >= 0
  );
}
