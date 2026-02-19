/**
 * GetProviderStatus Use-Case
 * Single Responsibility: Query provider connection status
 */

import type { Env } from "../../types/ai";
import type { ProviderConnectionStatus } from "../../schemas/provider";
import { ProviderConfigService } from "../../services/providers";

/**
 * GetProviderStatus use-case
 */
export class GetProviderStatus {
  private configService: ProviderConfigService;

  constructor(env: Env) {
    this.configService = new ProviderConfigService(env);
  }

  /**
   * Execute status query
   */
  async execute(): Promise<ProviderConnectionStatus[]> {
    return this.configService.getStatus();
  }
}
