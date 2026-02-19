/**
 * DisconnectProvider Use-Case
 * Single Responsibility: Disconnect a provider
 */

import type {
  DisconnectProviderRequest,
  ProviderId,
} from "../../schemas/provider";
import type { IProviderConfigService } from "../../services/providers";

/**
 * DisconnectProvider use-case
 * Depends on IProviderConfigService interface (injected by controller/composition root)
 */
export class DisconnectProvider {
  constructor(private configService: IProviderConfigService) {}

  /**
   * Execute provider disconnection
   */
  async execute(
    request: DisconnectProviderRequest,
  ): Promise<{ status: "disconnected"; providerId: ProviderId }> {
    return this.configService.disconnect(request);
  }
}
