// Git types
export type {
  FileStatusType,
  FileStatus,
  DiffLine,
  DiffHunk,
  DiffContent,
  CommitPayload,
  GitStatusResponse,
  GitDiffRequest,
  StageFilesRequest,
} from "./git.js";

// Platform defaults
export {
  DEFAULT_PLATFORM_PROVIDER_ID,
  DEFAULT_PLATFORM_MODEL_ID,
} from "./defaults.js";

// Credential vault contracts
export {
  CredentialVaultSurfaceSchema,
  CredentialVaultEntrySchema,
  CredentialVaultUnsupportedOperationError,
  type CredentialVaultSurface,
  type CredentialVaultEntry,
  type CredentialVault,
} from "./credential-vault.js";

// Provider/BYOK contracts
export {
  PROVIDER_IDS,
  ProviderIdSchema,
  ProviderCapabilityFlagsSchema,
  ModelDescriptorSchema,
  ProviderCatalogEntrySchema,
  ProviderCatalogResponseSchema,
  ProviderConnectionStateSchema,
  ProviderConnectionSchema,
  ProviderConnectionsResponseSchema,
  BYOKConnectRequestSchema,
  BYOKConnectResponseSchema,
  BYOKDisconnectRequestSchema,
  BYOKDisconnectResponseSchema,
  BYOKValidationModeSchema,
  BYOKValidateRequestSchema,
  BYOKValidateResponseSchema,
  BYOKPreferencesPatchSchema,
  BYOKPreferencesSchema,
  ProviderErrorCodeSchema,
  NormalizedProviderErrorSchema,
  ProviderErrorEnvelopeSchema,
} from "./provider.js";
export type {
  ProviderId,
  ProviderCapabilityFlags,
  ModelDescriptor,
  ProviderCatalogEntry,
  ProviderCatalogResponse,
  ProviderConnectionState,
  ProviderConnection,
  ProviderConnectionsResponse,
  BYOKConnectRequest,
  BYOKConnectResponse,
  BYOKDisconnectRequest,
  BYOKDisconnectResponse,
  BYOKValidationMode,
  BYOKValidateRequest,
  BYOKValidateResponse,
  BYOKPreferencesPatch,
  BYOKPreferences,
  ProviderErrorCode,
  NormalizedProviderError,
  ProviderErrorEnvelope,
} from "./provider.js";

// Run status types
export { RUN_STATUSES } from "./run-status.js";
export type { RunStatus } from "./run-status.js";

// Run event types
export {
  RUN_EVENT_TYPES,
  type EventSource,
  type RunEventType,
  type RunEventEnvelope,
  isRunEvent,
  isRunEventOfType,
  // Event types
  type RunStartedEvent,
  type RunStatusChangedEvent,
  type MessageEmittedEvent,
  type ToolRequestedEvent,
  type ToolStartedEvent,
  type ToolCompletedEvent,
  type ToolFailedEvent,
  type RunCompletedEvent,
  type RunFailedEvent,
  type RunEvent,
  // Payload types
  type RunStartedPayload,
  type RunStatusChangedPayload,
  type MessageEmittedPayload,
  type ToolRequestedPayload,
  type ToolStartedPayload,
  type ToolCompletedPayload,
  type ToolFailedPayload,
  type RunCompletedPayload,
  type RunFailedPayload,
} from "./run-events.js";

// Zod validation
export {
  parseRunEvent,
  safeParseRunEvent,
  validateEventEnvelope,
  getEventPayloadSchema,
} from "./run-events.zod.js";

// Chat response events (NDJSON streaming)
export {
  CHAT_RESPONSE_EVENT_TYPES,
  isChatResponseEvent,
  isChatResponseEventOfType,
  serializeChatResponseEvent,
  parseChatResponseEvent,
  type ChatResponseEventType,
  type ChatResponseEvent,
  type TextDeltaPayload,
  type ToolCallPayload,
  type ToolResultPayload,
  type ToolErrorPayload,
  type RunStatusPayload,
  type FinalPayload,
  type TextDeltaEvent,
  type ToolCallEvent,
  type ToolResultEvent,
  type ToolErrorEvent,
  type RunStatusEvent,
  type FinalEvent,
  type ChatResponseEventUnion,
} from "./chat-response-events.js";

// Chat response contract (v1 frozen DTOs for provider parity)
export {
  CHAT_RESPONSE_PROTOCOL_VERSION,
  ChatResponseEventSchema,
  validateChatResponseEvent,
  parseChatResponseEvent as parseChatResponseEventContract,
  safeParseChatResponseEvent,
  type ChatResponseEvent as ChatResponseEventContract,
} from "./chat-response-contract.js";

// External contract freeze manifest (chat/provider/tool/event)
export {
  EXTERNAL_CONTRACT_FREEZE_VERSION,
  EXTERNAL_CONTRACT_MANIFEST,
  EXTERNAL_CHAT_CONTRACT,
  EXTERNAL_PROVIDER_CONTRACT,
  EXTERNAL_TOOL_CONTRACT,
  EXTERNAL_EVENT_CONTRACT,
} from "./external-contracts.js";

// Compatibility layer
export {
  LEGACY_EVENT_NAMES,
  isLegacyEventName,
  getCanonicalEventType,
  convertLegacyEvent,
  normalizeEvent,
} from "./run-events.compat.js";

// BYOK module (new architecture)
// Note: Use explicit named exports to avoid conflicts with legacy v2 BYOK types
export {
  BYOKCredentialSchema,
  BYOKCredentialDTOSchema,
  BYOKPreferenceSchema,
  BYOKPreferencePatchSchema,
  BYOKResolutionSchema,
  BYOKResolveRequestSchema,
  BYOKErrorCodeSchema,
  BYOKErrorSchema,
  BYOKErrorEnvelopeSchema,
  BYOKValidationErrorDetailSchema,
  BYOKValidationErrorResponseSchema,
  RETRYABLE_ERRORS,
  isRetryableError,
  AUTH_ERRORS,
  isAuthError,
  createBYOKError,
  createBYOKErrorInternal,
  ProviderRegistryEntrySchema,
  ProviderRegistrySchema,
  BUILTIN_PROVIDERS,
  getBuiltinRegistry,
  findBuiltinProvider,
  isKnownProvider,
  getKnownProviderIds,
  // API contracts (exclude to avoid conflicts with v2)
  type BYOKCredential,
  type BYOKCredentialDTO,
  type BYOKPreference,
  type BYOKPreferencePatch,
  type BYOKResolution,
  type BYOKResolveRequest,
  type BYOKErrorCode,
  type BYOKError,
  type BYOKErrorInternal,
  type BYOKErrorEnvelope,
  type BYOKValidationErrorDetail,
  type BYOKValidationErrorResponse,
  type ProviderRegistryEntry,
  type ProviderRegistry,
} from "./byok/index.js";
