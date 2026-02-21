/**
 * ConnectProvider Use-Case
 * Single Responsibility: Connect a provider with API key
 */

import type {
  BYOKConnectRequest,
  BYOKConnectResponse,
} from "@repo/shared-types";
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
  async execute(request: BYOKConnectRequest): Promise<BYOKConnectResponse> {
    return this.configService.connect(request);
  }
}
