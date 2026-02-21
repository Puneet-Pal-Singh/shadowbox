/**
 * Provider services barrel export
 */

// Core services
export { ProviderCredentialService } from "./ProviderCredentialService";
export { ProviderCatalogService } from "./ProviderCatalogService";
export { ProviderConnectionService } from "./ProviderConnectionService";
export { ProviderConfigService } from "./ProviderConfigService";
export { DurableProviderStore } from "./DurableProviderStore";
export {
  PROVIDER_CAPABILITY_MATRIX,
  isModelAllowedByCapabilityMatrix,
  getProviderCapabilityFlags,
} from "./provider-capability-matrix";
export type { IProviderConfigService } from "./IProviderConfigService";

// Base types and errors
export {
  ProviderError,
  type ProviderAdapter,
  type GenerationParams,
  type GenerationResult,
  type StreamChunk,
} from "./base";

// Adapter implementations
export { LiteLLMAdapter } from "./adapters";
export { OpenAIAdapter } from "./adapters";
export { AnthropicAdapter } from "./adapters";
export {
  OpenAICompatibleAdapter,
  streamGenerationHelper,
  type OpenAICompatibleConfig,
  type StreamHelperOptions,
  type StreamProducer,
  type UsageStandardizer,
} from "./adapters";
