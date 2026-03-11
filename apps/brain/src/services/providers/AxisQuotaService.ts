import { AxisDailyLimitExceededError } from "../../domain/errors";
import { AXIS_DAILY_LIMIT } from "./axis";
import type { DurableProviderStore } from "./DurableProviderStore";

export interface AxisQuotaStatus {
  used: number;
  limit: number;
  resetsAt: string;
}

export class AxisQuotaService {
  constructor(
    private readonly durableStore: DurableProviderStore,
    private readonly dailyLimit: number = AXIS_DAILY_LIMIT,
  ) {}

  async getStatus(now: Date = new Date()): Promise<AxisQuotaStatus> {
    const dayKey = getUtcDayKey(now);
    const used = await this.durableStore.getAxisQuotaUsage(dayKey);
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

    const nextUsed = status.used + 1;
    await this.durableStore.setAxisQuotaUsage(dayKey, nextUsed);
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

