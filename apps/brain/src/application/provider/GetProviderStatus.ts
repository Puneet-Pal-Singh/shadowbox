/**
 * GetProviderStatus Use-Case
 * Single Responsibility: Query provider connection status
 */

import type { ProviderConnection } from "@repo/shared-types";
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
  async execute(): Promise<ProviderConnection[]> {
    return this.configService.getStatus();
  }
}
