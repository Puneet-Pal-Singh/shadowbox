/**
 * GetProviderStatus Use-Case
 * Single Responsibility: Query provider connection status
 */

import type { ProviderConnectionStatus } from "../../schemas/provider";
import type { IProviderConfigService } from "../../services/providers";

/**
 * GetProviderStatus use-case
 * Depends on IProviderConfigService interface (injected by controller/composition root)
 */
export class GetProviderStatus {
  constructor(private configService: IProviderConfigService) {}

  /**
   * Execute status query
   */
  async execute(): Promise<ProviderConnectionStatus[]> {
    return this.configService.getStatus();
  }
}
