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
  mode?: RunMode;
  workflowIntent?: WorkflowIntent;
}

interface ResolvedLimit {
  bucket: "run_submission" | "mutation_run_submission";
  limit: number;
  windowSeconds: number;
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
    const key = this.buildWindowCounterKey(limit.bucket, input, limit.windowSeconds);
    const currentCount = await this.readCounter(key);

    if (currentCount >= limit.limit) {
      throw new DomainError(
        "RUN_SUBMISSION_RATE_LIMITED",
        `Run submission rate limit reached. Retry in ${limit.windowSeconds}s.`,
        429,
        true,
        correlationId,
        {
          bucket: limit.bucket,
          limit: limit.limit,
          retryAfterSeconds: limit.windowSeconds,
        },
      );
    }

    await this.writeCounter(key, currentCount + 1, limit.windowSeconds);
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

  private buildWindowCounterKey(
    bucket: ResolvedLimit["bucket"],
    input: RunAdmissionInput,
    windowSeconds: number,
  ): string {
    const scope = this.buildScope(input);
    const windowBucket = Math.floor(Date.now() / (windowSeconds * 1000));
    return `launch:${bucket}:v1:${scope}:${windowBucket}`;
  }

  private buildScope(input: RunAdmissionInput): string {
    const userId = normalizeScopeValue(input.userId);
    const workspaceId = normalizeScopeValue(input.workspaceId);
    return `user:${userId}:workspace:${workspaceId}`;
  }

  private async readCounter(key: string): Promise<number> {
    const raw = await this.env.SESSIONS.get(key);
    return readPositiveInt(raw, 0);
  }

  private async writeCounter(
    key: string,
    value: number,
    windowSeconds: number,
  ): Promise<void> {
    await this.env.SESSIONS.put(key, String(value), {
      expirationTtl: windowSeconds + 5,
    });
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
