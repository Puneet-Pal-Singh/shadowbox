/**
 * BYOK (Bring Your Own Key) Module
 *
 * Exports for the new BYOK architecture.
 * Decoupled from fixed provider enums, supports dynamic provider registry.
 */

// Credential entity
export {
  BYOKCredentialSchema,
  BYOKCredentialDTOSchema,
  type BYOKCredential,
  type BYOKCredentialDTO,
} from "./credential.js";

// Preference entity
export {
  BYOKPreferenceSchema,
  BYOKPreferencePatchSchema,
  type BYOKPreference,
  type BYOKPreferencePatch,
} from "./preference.js";

// Resolution result
export {
  BYOKResolutionSchema,
  BYOKResolveRequestSchema,
  type BYOKResolution,
  type BYOKResolveRequest,
} from "./resolution.js";

// Error taxonomy
export {
  BYOKErrorCodeSchema,
  BYOKErrorSchema,
  BYOKErrorInternalSchema,
  BYOKErrorEnvelopeSchema,
  BYOKValidationErrorDetailSchema,
  BYOKValidationErrorResponseSchema,
  RETRYABLE_ERRORS,
  isRetryableError,
  AUTH_ERRORS,
  isAuthError,
  createBYOKError,
  createBYOKErrorInternal,
  type BYOKErrorCode,
  type BYOKError,
  type BYOKErrorInternal,
  type BYOKErrorEnvelope,
  type BYOKValidationErrorDetail,
  type BYOKValidationErrorResponse,
} from "./error.js";

// Provider registry
export {
  ProviderRegistryEntrySchema,
  ProviderRegistrySchema,
  BUILTIN_PROVIDERS,
  getBuiltinRegistry,
  findBuiltinProvider,
  isKnownProvider,
  getKnownProviderIds,
  type ProviderRegistryEntry,
  type ProviderRegistry,
} from "./registry.js";

// API contracts
export {
  BYOKConnectRequestSchema,
  BYOKConnectResponseSchema,
  BYOKValidateRequestSchema,
  BYOKValidateResponseSchema,
  BYOKCredentialConnectRequestSchema,
  BYOKCredentialUpdateRequestSchema,
  BYOKCredentialValidateRequestSchema,
  BYOKCredentialValidateResponseSchema,
  BYOKProviderModelsResponseSchema,
  BYOKPreferencesUpdateRequestSchema,
  type BYOKConnectRequest,
  type BYOKConnectResponse,
  type BYOKValidateRequest,
  type BYOKValidateResponse,
  type BYOKCredentialConnectRequest,
  type BYOKCredentialUpdateRequest,
  type BYOKCredentialValidateRequest,
  type BYOKCredentialValidateResponse,
  type BYOKProviderModelsResponse,
  type BYOKPreferencesUpdateRequest,
} from "./api.js";
