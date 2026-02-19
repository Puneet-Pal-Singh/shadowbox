/**
 * DisconnectProvider Use-Case
 * Single Responsibility: Disconnect a provider
 */

import type { Env } from "../../types/ai";
import type {
  DisconnectProviderRequest,
  ProviderId,
} from "../../schemas/provider";
import { ProviderConfigService } from "../../services/providers";

/**
 * DisconnectProvider use-case
 */
export class DisconnectProvider {
  private configService: ProviderConfigService;

  constructor(env: Env) {
    this.configService = new ProviderConfigService(env);
  }

  /**
   * Execute provider disconnection
   */
  async execute(
    request: DisconnectProviderRequest,
  ): Promise<{ status: "disconnected"; providerId: ProviderId }> {
    return this.configService.disconnect(request);
  }
}
