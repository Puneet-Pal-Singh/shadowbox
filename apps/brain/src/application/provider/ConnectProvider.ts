/**
 * ConnectProvider Use-Case
 * Single Responsibility: Connect a provider with API key
 */

import type { Env } from "../../types/ai";
import type {
  ConnectProviderRequest,
  ConnectProviderResponse,
} from "../../schemas/provider";
import { ProviderConfigService } from "../../services/providers";

/**
 * ConnectProvider use-case
 */
export class ConnectProvider {
  private configService: ProviderConfigService;

  constructor(env: Env) {
    this.configService = new ProviderConfigService(env);
  }

  /**
   * Execute provider connection
   */
  async execute(request: ConnectProviderRequest): Promise<ConnectProviderResponse> {
    return this.configService.connect(request);
  }
}
