import {
  BYOKConnectRequestSchema,
  BYOKConnectResponseSchema,
  BYOKDisconnectRequestSchema,
  BYOKDisconnectResponseSchema,
  BYOKPreferencesPatchSchema,
  BYOKPreferencesSchema,
  BYOKValidateRequestSchema,
  BYOKValidateResponseSchema,
  ProviderCatalogResponseSchema,
  ProviderConnectionsResponseSchema,
  ProviderErrorEnvelopeSchema,
  PROVIDER_ID_PATTERN,
  ProviderIdSchema,
} from "./provider.js";
import {
  BYOKDiscoveredProviderModelsQuerySchema,
  BYOKDiscoveredProviderModelsRefreshResponseSchema,
  BYOKDiscoveredProviderModelsResponseSchema,
} from "./byok/api.js";
import {
  CHAT_RESPONSE_PROTOCOL_VERSION,
  ChatResponseEventSchema,
  FinalPayloadSchema,
  RunStatusPayloadSchema,
  TextDeltaPayloadSchema,
  ToolCallPayloadSchema,
  ToolErrorPayloadSchema,
  ToolResultPayloadSchema,
} from "./chat-response-contract.js";
import { CHAT_RESPONSE_EVENT_TYPES } from "./chat-response-events.js";

/**
 * Version marker for frozen external contract shapes.
 * Bump only for coordinated breaking migrations.
 */
export const EXTERNAL_CONTRACT_FREEZE_VERSION = 1 as const;

export const EXTERNAL_CONTRACT_MANIFEST = {
  version: EXTERNAL_CONTRACT_FREEZE_VERSION,
  eventEnvelopeFields: ["type", "runId", "timestamp", "payload"],
  chat: {
    protocolVersion: CHAT_RESPONSE_PROTOCOL_VERSION,
    eventTypes: Object.values(CHAT_RESPONSE_EVENT_TYPES),
    payloadFields: {
      textDelta: ["content", "index"],
      toolCall: ["toolId", "toolName", "arguments", "callId"],
      toolResult: ["toolId", "toolName", "callId", "result", "executionTimeMs"],
      toolError: ["toolId", "toolName", "callId", "error", "executionTimeMs"],
      runStatus: ["status", "reason", "taskCount", "completedTaskCount"],
      final: [
        "status",
        "totalDurationMs",
        "toolCallCount",
        "failedToolCount",
        "message",
      ],
    },
  },
  provider: {
    providerIdPattern: PROVIDER_ID_PATTERN,
    connectRequestFields: ["providerId", "apiKey"],
    connectResponseFields: [
      "status",
      "providerId",
      "lastValidatedAt",
      "errorMessage",
    ],
    disconnectRequestFields: ["providerId"],
    disconnectResponseFields: ["status", "providerId"],
    validateRequestFields: ["providerId", "mode"],
    validateResponseFields: ["providerId", "status", "checkedAt", "validationMode"],
    preferencesPatchFields: ["defaultProviderId", "defaultModelId"],
    preferencesFields: ["defaultProviderId", "defaultModelId", "updatedAt"],
    connectionsResponseFields: ["connections"],
    catalogResponseFields: ["providers", "generatedAt"],
    discoveryModelsQueryFields: ["view", "limit", "cursor"],
    discoveryModelsResponseFields: [
      "providerId",
      "view",
      "models",
      "page",
      "metadata",
    ],
    discoveryModelsRefreshResponseFields: [
      "providerId",
      "refreshedAt",
      "source",
      "cacheInvalidated",
      "modelsCount",
    ],
    errorEnvelopeFields: ["error"],
  },
} as const;

export const EXTERNAL_CHAT_CONTRACT = {
  protocolVersion: CHAT_RESPONSE_PROTOCOL_VERSION,
  eventSchema: ChatResponseEventSchema,
  eventTypes: CHAT_RESPONSE_EVENT_TYPES,
  payloadSchemas: {
    textDelta: TextDeltaPayloadSchema,
    toolCall: ToolCallPayloadSchema,
    toolResult: ToolResultPayloadSchema,
    toolError: ToolErrorPayloadSchema,
    runStatus: RunStatusPayloadSchema,
    final: FinalPayloadSchema,
  },
} as const;

export const EXTERNAL_PROVIDER_CONTRACT = {
  providerIdSchema: ProviderIdSchema,
  catalogResponseSchema: ProviderCatalogResponseSchema,
  connectionsResponseSchema: ProviderConnectionsResponseSchema,
  connectRequestSchema: BYOKConnectRequestSchema,
  connectResponseSchema: BYOKConnectResponseSchema,
  disconnectRequestSchema: BYOKDisconnectRequestSchema,
  disconnectResponseSchema: BYOKDisconnectResponseSchema,
  validateRequestSchema: BYOKValidateRequestSchema,
  validateResponseSchema: BYOKValidateResponseSchema,
  preferencesPatchSchema: BYOKPreferencesPatchSchema,
  preferencesSchema: BYOKPreferencesSchema,
  discoveredProviderModelsQuerySchema: BYOKDiscoveredProviderModelsQuerySchema,
  discoveredProviderModelsResponseSchema: BYOKDiscoveredProviderModelsResponseSchema,
  discoveredProviderModelsRefreshResponseSchema:
    BYOKDiscoveredProviderModelsRefreshResponseSchema,
  errorEnvelopeSchema: ProviderErrorEnvelopeSchema,
} as const;

export const EXTERNAL_TOOL_CONTRACT = {
  toolCallPayloadSchema: ToolCallPayloadSchema,
  toolResultPayloadSchema: ToolResultPayloadSchema,
  toolErrorPayloadSchema: ToolErrorPayloadSchema,
} as const;

export const EXTERNAL_EVENT_CONTRACT = {
  eventTypes: CHAT_RESPONSE_EVENT_TYPES,
  eventSchema: ChatResponseEventSchema,
} as const;
