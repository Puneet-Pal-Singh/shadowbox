import type { BYOKDiscoveredProviderModel } from "@repo/shared-types";
import type {
  ProviderModelCredentialContext,
  ProviderModelFetchPageInput,
  ProviderModelPageFetchResult,
} from "./types";

export interface ProviderModelCatalogPort {
  fetchAll(
    providerId: string,
    credentialContext: ProviderModelCredentialContext,
  ): Promise<BYOKDiscoveredProviderModel[]>;

  fetchPage(input: ProviderModelFetchPageInput): Promise<ProviderModelPageFetchResult>;
}
