/**
 * D1 Axis Quota Service
 *
 * D1-backed implementation for Axis quota tracking.
 */

import type { D1Database } from "@cloudflare/workers-types";
import { AxisDailyLimitExceededError } from "../../domain/errors";
import { AXIS_DAILY_LIMIT } from "./axis";
import type { ProviderQuotaStore } from "./stores/ProviderQuotaStore";

export interface AxisQuotaStatus {
  used: number;
  limit: number;
  resetsAt: string;
}

export class D1AxisQuotaService implements ProviderQuotaStore {
  private readonly dailyLimit: number;
  private readonly userId: string;
  private readonly workspaceId: string;

  constructor(
    private db: D1Database,
    userId: string,
    workspaceId: string,
    dailyLimit: number = AXIS_DAILY_LIMIT,
  ) {
    this.userId = userId;
    this.workspaceId = workspaceId;
    this.dailyLimit = dailyLimit;
  }

  async getAxisQuotaUsage(dayKey: string): Promise<number> {
    const key = `quota:${this.userId}:${this.workspaceId}:${dayKey}`;
    const query = `
      SELECT value FROM provider_axis_quota
      WHERE quota_key = ?
    `;

    try {
      const stmt = this.db.prepare(query).bind(key);
      const row = await stmt.first<{ value: number }>();
      return row?.value ?? 0;
    } catch {
      return 0;
    }
  }

  async setAxisQuotaUsage(dayKey: string, usage: number): Promise<void> {
    const key = `quota:${this.userId}:${this.workspaceId}:${dayKey}`;
    const query = `
      INSERT INTO provider_axis_quota (quota_key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(quota_key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `;

    await this.db
      .prepare(query)
      .bind(key, usage, new Date().toISOString())
      .run();
  }

  async incrementAndGetQuota(dayKey: string): Promise<number> {
    const current = await this.getAxisQuotaUsage(dayKey);
    const next = current + 1;
    await this.setAxisQuotaUsage(dayKey, next);
    return next;
  }

  async getStatus(now: Date = new Date()): Promise<AxisQuotaStatus> {
    const dayKey = getUtcDayKey(now);
    const used = await this.getAxisQuotaUsage(dayKey);
    return {
      used,
      limit: this.dailyLimit,
      resetsAt: getNextUtcDayBoundary(now),
    };
  }

  async consume(correlationId?: string): Promise<AxisQuotaStatus> {
    const now = new Date();
    const dayKey = getUtcDayKey(now);
    const status = await this.getStatus(now);

    if (status.used >= status.limit) {
      throw new AxisDailyLimitExceededError(status, correlationId);
    }

    const nextUsed = await this.incrementAndGetQuota(dayKey);
    return {
      ...status,
      used: nextUsed,
    };
  }
}

export function getUtcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function getNextUtcDayBoundary(now: Date): string {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return next.toISOString();
}
