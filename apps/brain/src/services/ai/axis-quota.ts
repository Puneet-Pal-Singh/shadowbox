import { AXIS_PROVIDER_ID } from "../providers/axis";
import { type ProviderConfigService } from "../providers";

export async function consumeAxisQuotaIfNeeded(
  providerId: string | undefined,
  providerConfigService: ProviderConfigService | undefined,
): Promise<void> {
  if (providerId !== AXIS_PROVIDER_ID || !providerConfigService) {
    return;
  }
  await providerConfigService.consumeAxisQuota();
}
