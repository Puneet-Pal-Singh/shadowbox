/**
 * BYOK Observability Infrastructure
 *
 * Centralized metrics, structured logging, and alerting for BYOK operations.
 * Emits:
 * - Structured logs with correlationId, userId, workspaceId, providerId
 * - Metrics for: connect, validate, resolve operations + latency
 * - Alerts for failure surges and latency anomalies
 *
 * Usage:
 *   const obs = new ByokObservability(env);
 *   obs.recordConnect('openai', 'success', 250);
 *   obs.recordResolve('v3', 80);
 *   obs.logOperation('connect', { userId, workspaceId, providerId, status });
 */

export interface ByokOperationContext {
  correlationId: string;
  userId: string;
  workspaceId: string;
  providerId?: string;
  credentialId?: string;
  operation: "connect" | "validate" | "disconnect" | "resolve" | "migrate";
  status: "success" | "failure";
  latencyMs?: number;
  source?: "v3" | "v2"; // For dual-read tracking
  mode?: "format" | "live"; // For validation
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Metrics aggregator
 */
interface MetricsBucket {
  byok_connect_total: Record<string, number>; // {provider}_{status}
  byok_validate_total: Record<string, number>; // {provider}_{mode}_{status}
  byok_resolve_total: Record<string, number>; // {source}_{result}
  byok_resolve_latency: number[]; // Array of latency ms
  byok_migration_progress: {
    migratedCount: number;
    failedCount: number;
    lastUpdateAt: string;
  };
  chat_provider_resolution_fail_total: number;
}

/**
 * ByokObservability - Records metrics and structured logs
 */
export class ByokObservability {
  private metrics: MetricsBucket;
  private enableLogging: boolean;

  constructor(enableLogging: boolean = true) {
    this.enableLogging = enableLogging;
    this.metrics = {
      byok_connect_total: {},
      byok_validate_total: {},
      byok_resolve_total: {},
      byok_resolve_latency: [],
      byok_migration_progress: {
        migratedCount: 0,
        failedCount: 0,
        lastUpdateAt: new Date().toISOString(),
      },
      chat_provider_resolution_fail_total: 0,
    };
  }

  /**
   * Record a connection attempt
   */
  recordConnect(
    providerId: string,
    status: "success" | "failure",
    latencyMs: number
  ): void {
    const key = `${providerId}_${status}`;
    this.metrics.byok_connect_total[key] =
      (this.metrics.byok_connect_total[key] ?? 0) + 1;

    if (this.enableLogging) {
      console.log(
        `[byok.metrics] connect provider=${providerId} status=${status} latencyMs=${latencyMs}`
      );
    }
  }

  /**
   * Record a validation attempt
   */
  recordValidate(
    providerId: string,
    mode: "format" | "live",
    status: "success" | "failure",
    latencyMs: number
  ): void {
    const key = `${providerId}_${mode}_${status}`;
    this.metrics.byok_validate_total[key] =
      (this.metrics.byok_validate_total[key] ?? 0) + 1;

    if (this.enableLogging) {
      console.log(
        `[byok.metrics] validate provider=${providerId} mode=${mode} status=${status} latencyMs=${latencyMs}`
      );
    }
  }

  /**
   * Record a resolution operation
   */
  recordResolve(source: "v3" | "v2", latencyMs: number, success: boolean): void {
    const key = `${source}_${success ? "success" : "failure"}`;
    this.metrics.byok_resolve_total[key] =
      (this.metrics.byok_resolve_total[key] ?? 0) + 1;

    this.metrics.byok_resolve_latency.push(latencyMs);

    if (!success) {
      this.metrics.chat_provider_resolution_fail_total++;
    }

    if (this.enableLogging) {
      console.log(
        `[byok.metrics] resolve source=${source} latencyMs=${latencyMs} status=${success ? "success" : "failure"}`
      );
    }
  }

  /**
   * Record migration progress
   */
  recordMigrationProgress(
    migratedCount: number,
    failedCount: number
  ): void {
    this.metrics.byok_migration_progress = {
      migratedCount,
      failedCount,
      lastUpdateAt: new Date().toISOString(),
    };

    if (this.enableLogging) {
      console.log(
        `[byok.metrics] migration migratedCount=${migratedCount} failedCount=${failedCount}`
      );
    }
  }

  /**
   * Log structured operation context
   */
  logOperation(context: ByokOperationContext): void {
    if (!this.enableLogging) return;

    // Sanitized log (no secrets, safe to store)
    const sanitized = {
      correlationId: context.correlationId,
      userId: context.userId,
      workspaceId: context.workspaceId,
      providerId: context.providerId,
      credentialId: context.credentialId,
      operation: context.operation,
      status: context.status,
      latencyMs: context.latencyMs,
      source: context.source,
      mode: context.mode,
      errorCode: context.errorCode,
      // Note: errorMessage included but must be sanitized (no secrets)
      errorMessage: this.sanitizeErrorMessage(context.errorMessage),
    };

    console.log(
      `[byok.operation] ${JSON.stringify(sanitized)}`
    );
  }

  /**
   * Get all metrics (for periodic flush to KV/Analytics Engine)
   */
  getMetrics(): MetricsBucket {
    return { ...this.metrics };
  }

  /**
   * Get computed statistics for alerting
   */
  getStatistics(): {
    connectFailureRate: number;
    resolveP95Latency: number;
    resolvepP99Latency: number;
    chatResolutionFailureCount: number;
    migrationProgress: { percent: number; remaining: number };
  } {
    // Connect failure rate
    const connectTotal = Object.values(
      this.metrics.byok_connect_total
    ).reduce((a, b) => a + b, 0);
    const connectFailures = this.metrics.byok_connect_total["*_failure"] ?? 0;
    const connectFailureRate =
      connectTotal > 0 ? connectFailures / connectTotal : 0;

    // Resolve latency percentiles
    const sortedLatencies = [...this.metrics.byok_resolve_latency].sort(
      (a, b) => a - b
    );
    const resolveP95Latency =
      sortedLatencies.length > 0
        ? sortedLatencies[Math.floor(sortedLatencies.length * 0.95)]
        : 0;
    const resolvepP99Latency =
      sortedLatencies.length > 0
        ? sortedLatencies[Math.floor(sortedLatencies.length * 0.99)]
        : 0;

    // Migration progress
    const {
      migratedCount,
      failedCount,
    } = this.metrics.byok_migration_progress;
    const totalMigration = migratedCount + failedCount;
    const migrationProgress = {
      percent:
        totalMigration > 0
          ? Math.round((migratedCount / totalMigration) * 100)
          : 0,
      remaining: totalMigration - migratedCount,
    };

    return {
      connectFailureRate,
      resolveP95Latency,
      resolvepP99Latency,
      chatResolutionFailureCount:
        this.metrics.chat_provider_resolution_fail_total,
      migrationProgress,
    };
  }

  /**
   * Check if any alert conditions are met
   */
  checkAlerts(): Array<{
    severity: "warning" | "critical";
    message: string;
  }> {
    const alerts: Array<{
      severity: "warning" | "critical";
      message: string;
    }> = [];

    const stats = this.getStatistics();

    // Alert 1: Connect failure rate > 2x baseline
    if (stats.connectFailureRate > 0.02) {
      alerts.push({
        severity: "critical",
        message: `BYOK connect failure rate high: ${(stats.connectFailureRate * 100).toFixed(2)}%`,
      });
    }

    // Alert 2: Resolve p99 latency > 1000ms
    if (stats.resolvepP99Latency > 1000) {
      alerts.push({
        severity: "warning",
        message: `BYOK resolve latency high: p99=${stats.resolvepP99Latency}ms`,
      });
    }

    // Alert 3: Chat resolution failures
    if (stats.chatResolutionFailureCount > 10) {
      alerts.push({
        severity: "critical",
        message: `Chat provider resolution failures: ${stats.chatResolutionFailureCount} in current window`,
      });
    }

    // Alert 4: Migration failures accumulating
    if (stats.migrationProgress.remaining > 1000 && stats.connectFailureRate > 0.01) {
      alerts.push({
        severity: "warning",
        message: `BYOK migration progress slow: ${stats.migrationProgress.remaining} records remaining`,
      });
    }

    return alerts;
  }

  /**
   * Reset metrics (for testing or periodic flushing)
   */
  reset(): void {
    this.metrics = {
      byok_connect_total: {},
      byok_validate_total: {},
      byok_resolve_total: {},
      byok_resolve_latency: [],
      byok_migration_progress: {
        migratedCount: 0,
        failedCount: 0,
        lastUpdateAt: new Date().toISOString(),
      },
      chat_provider_resolution_fail_total: 0,
    };
  }

  /**
   * Sanitize error messages to prevent secret leakage
   */
  private sanitizeErrorMessage(message?: string): string | undefined {
    if (!message) return undefined;

    // Remove common patterns that might contain secrets
    return message
      .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***")
      .replace(/Bearer [a-zA-Z0-9_.=-]{20,}/g, "Bearer ***")
      .replace(/"secret[^"]*":\s*"[^"]*"/gi, '"secret": "***"')
      .substring(0, 500); // Truncate to 500 chars
  }
}
