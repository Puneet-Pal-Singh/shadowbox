/**
 * ConnectProvider Use-Case
 * Single Responsibility: Connect a provider with API key
 */

import type {
  ConnectProviderRequest,
  ConnectProviderResponse,
} from "../../schemas/provider";
import type { IProviderConfigService } from "../../services/providers";

/**
 * ConnectProvider use-case
 * Depends on IProviderConfigService interface (injected by controller/composition root)
 */
export class ConnectProvider {
  constructor(private configService: IProviderConfigService) {}

  /**
   * Execute provider connection
   */
  async execute(request: ConnectProviderRequest): Promise<ConnectProviderResponse> {
    return this.configService.connect(request);
  }
}
