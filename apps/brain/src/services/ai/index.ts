/**
 * AI services barrel export
 */

export {
  type ProviderEndpointConfig,
  PROVIDER_ENDPOINTS,
  validateProviderApiKeyFormat,
  getProviderBaseURL,
} from "./ProviderEndpointPolicy";

export {
  type RuntimeProvider,
  type ModelSelection,
  resolveModelSelection,
  mapProviderIdToRuntimeProvider,
  getRuntimeProviderFromAdapter,
} from "./ModelSelectionPolicy";

export {
  resolveOpenAIKey,
  resolveAnthropicKey,
  resolveOpenRouterKey,
  resolveGroqKey,
  resolveLiteLLMKey,
  resolveProviderKey,
} from "./ProviderKeyValidator";

export {
  createDefaultAdapter,
  createLiteLLMAdapter,
  createOpenAIAdapter,
  createAnthropicAdapter,
  createOpenRouterAdapter,
  createGroqAdapter,
} from "./ProviderAdapterFactory";

export { createSDKModel } from "./SDKModelFactory";

export {
  type GenerateTextResult,
  generateText,
} from "./TextGenerationService";

export {
  type GenerateStructuredResult,
  generateStructured,
} from "./StructuredGenerationService";

export { createChatStream } from "./StreamGenerationService";

export { selectAdapter } from "./AdapterSelectionService";
