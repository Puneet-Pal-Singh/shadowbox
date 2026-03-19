/**
 * Provider Quota Store Interface
 *
 * Focused interface for Axis quota tracking.
 */

export interface ProviderQuotaStore {
  /**
   * Get current daily quota usage
   */
  getAxisQuotaUsage(dayKey: string): Promise<number>;

  /**
   * Set daily quota usage
   */
  setAxisQuotaUsage(dayKey: string, usage: number): Promise<void>;

  /**
   * Increment and return new quota usage
   */
  incrementAndGetQuota(dayKey: string): Promise<number>;
}
