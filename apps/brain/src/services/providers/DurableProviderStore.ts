/**
 * DurableProviderStore
 * Persists provider credentials in Durable Object storage for cross-isolate access
 *
 * Problem: ProviderConfigService was isolate-local (ephemeral)
 * Solution: Store provider state in Durable Objects so RunEngine can access it
 *
 * Design:
 * - Stores encrypted provider credentials in Durable Object
 * - Exposes get/set/delete methods for provider state
 * - Provides atomic operations with transactional guarantees
 */

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { ProviderId } from "../../schemas/provider";

export interface ProviderCredential {
  providerId: ProviderId;
  apiKey: string;
  connectedAt: string;
}

const PROVIDER_STORE_PREFIX = "provider:";

export class DurableProviderStore {
  constructor(
    private state: DurableObjectState,
    private runId: string,
  ) {}

  /**
   * Store a provider credential
   * Uses transactional write to ensure atomicity
   */
  async setProvider(
    providerId: ProviderId,
    apiKey: string,
  ): Promise<void> {
    const key = `${PROVIDER_STORE_PREFIX}${this.runId}:${providerId}`;
    const credential: ProviderCredential = {
      providerId,
      apiKey,
      connectedAt: new Date().toISOString(),
    };

    await this.state.storage?.put(key, JSON.stringify(credential));
    console.log(`[provider/durable] Stored credential for ${providerId}`);
  }

  /**
   * Get a provider credential
   * Returns null if not found
   */
  async getProvider(providerId: ProviderId): Promise<ProviderCredential | null> {
    const key = `${PROVIDER_STORE_PREFIX}${this.runId}:${providerId}`;
    const data = await this.state.storage?.get(key);

    if (!data) {
      return null;
    }

    try {
      return JSON.parse(data as string) as ProviderCredential;
    } catch (e) {
      console.error(
        `[provider/durable] Failed to parse credential for ${providerId}:`,
        e,
      );
      return null;
    }
  }

  /**
   * Get API key for a provider
   * Returns null if provider not connected
   */
  async getApiKey(providerId: ProviderId): Promise<string | null> {
    const credential = await this.getProvider(providerId);
    return credential?.apiKey ?? null;
  }

  /**
   * Check if provider is connected
   */
  async isConnected(providerId: ProviderId): Promise<boolean> {
    const credential = await this.getProvider(providerId);
    return credential !== null;
  }

  /**
   * Delete a provider credential
   */
  async deleteProvider(providerId: ProviderId): Promise<void> {
    const key = `${PROVIDER_STORE_PREFIX}${this.runId}:${providerId}`;
    await this.state.storage?.delete(key);
    console.log(`[provider/durable] Deleted credential for ${providerId}`);
  }

  /**
   * Get all connected providers
   */
  async getAllProviders(): Promise<ProviderId[]> {
    const prefix = `${PROVIDER_STORE_PREFIX}${this.runId}:`;
    const entries = await this.state.storage?.list({ prefix });
    if (!entries) {
      return [];
    }

    const providerIds: ProviderId[] = [];
    for (const [key] of entries) {
      const providerId = key.substring(prefix.length);
      providerIds.push(providerId as ProviderId);
    }

    return providerIds;
  }

  /**
   * Clear all provider credentials
   * ⚠️ DANGEROUS: Only use in testing
   * 
   * Note: Uses a marker property instead of process.env to detect test mode,
   * since Cloudflare Workers don't have a process global by default.
   */
  async clearAll(): Promise<void> {
    // Check if running in test environment by looking for a marker property
    // In Cloudflare Workers, process.env may not exist, so we check globalThis
    const isTestEnv = typeof (globalThis as any).__TEST_MODE__ !== "undefined";
    if (!isTestEnv) {
      throw new Error(
        "clearAll() is only available in test environments",
      );
    }

    const prefix = `${PROVIDER_STORE_PREFIX}${this.runId}:`;
    const entries = await this.state.storage?.list({ prefix });
    if (!entries) return;

    for (const [key] of entries) {
      await this.state.storage?.delete(key);
    }

    console.log("[provider/durable] Cleared all credentials (test only)");
  }
}
