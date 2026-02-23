/**
 * BYOK Contract Tests
 *
 * Validates that all BYOK types, schemas, and registry work correctly.
 * These tests ensure the foundation is solid before building backend/frontend on top.
 */

import { describe, it, expect } from "vitest";
import {
  BYOKCredentialSchema,
  BYOKCredentialDTOSchema,
  BYOKPreferenceSchema,
  BYOKResolutionSchema,
  BYOKConnectRequestSchema,
  BYOKValidateRequestSchema,
  BYOKErrorSchema,
  BYOKErrorCodeSchema,
  createBYOKError,
  isRetryableError,
  isAuthError,
  ProviderRegistryEntrySchema,
  BUILTIN_PROVIDERS,
  getBuiltinRegistry,
  findBuiltinProvider,
  isKnownProvider,
  getKnownProviderIds,
} from "../byok/index.js";

describe("BYOK Credential Entity", () => {
  it("validates credential with all fields", () => {
    const credential = {
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user123",
      workspaceId: "workspace456",
      providerId: "openai",
      label: "My OpenAI Key",
      keyFingerprint: "sk-...abc123",
      encryptedSecretJson: '{"alg":"AES-256-GCM","ciphertext":"..."}',
      keyVersion: "v1",
      status: "connected" as const,
      lastValidatedAt: "2025-02-23T10:00:00Z",
      createdAt: "2025-02-23T10:00:00Z",
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKCredentialSchema.safeParse(credential);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.providerId).toBe("openai");
      expect(result.data.status).toBe("connected");
    }
  });

  it("rejects credential with invalid UUID", () => {
    const credential = {
      credentialId: "invalid-uuid",
      userId: "user123",
      workspaceId: "workspace456",
      providerId: "openai",
      label: "My OpenAI Key",
      keyFingerprint: "sk-...abc123",
      encryptedSecretJson: '{"alg":"AES-256-GCM","ciphertext":"..."}',
      keyVersion: "v1",
      createdAt: "2025-02-23T10:00:00Z",
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKCredentialSchema.safeParse(credential);
    expect(result.success).toBe(false);
  });

  it("credential DTO excludes encryption details", () => {
    const credentialDTO = {
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user123",
      workspaceId: "workspace456",
      providerId: "openai",
      label: "My OpenAI Key",
      keyFingerprint: "sk-...abc123",
      status: "connected" as const,
      createdAt: "2025-02-23T10:00:00Z",
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKCredentialDTOSchema.safeParse(credentialDTO);
    expect(result.success).toBe(true);
  });

  it("credential DTO does not include encrypted fields in parsed output", () => {
    const credentialDTO = {
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user123",
      workspaceId: "workspace456",
      providerId: "openai",
      label: "My OpenAI Key",
      keyFingerprint: "sk-...abc123",
      encryptedSecretJson: '{"alg":"AES-256-GCM","ciphertext":"..."}',
      status: "connected" as const,
      createdAt: "2025-02-23T10:00:00Z",
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKCredentialDTOSchema.safeParse(credentialDTO);
    expect(result.success).toBe(true);
    if (result.success) {
      // Verify encrypted fields are not in the parsed result
      expect("encryptedSecretJson" in result.data).toBe(false);
      expect("keyVersion" in result.data).toBe(false);
    }
  });
});

describe("BYOK Preference Entity", () => {
  it("validates preference with defaults", () => {
    const preference = {
      userId: "user123",
      workspaceId: "workspace456",
      defaultProviderId: "openai",
      defaultModelId: "gpt-4-turbo",
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKPreferenceSchema.safeParse(preference);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fallbackMode).toBe("strict");
      expect(result.data.fallbackChain).toEqual([]);
    }
  });

  it("validates preference with fallback chain", () => {
    const preference = {
      userId: "user123",
      workspaceId: "workspace456",
      defaultProviderId: "openai",
      fallbackMode: "allow_fallback" as const,
      fallbackChain: ["groq", "openrouter"],
      updatedAt: "2025-02-23T10:00:00Z",
    };

    const result = BYOKPreferenceSchema.safeParse(preference);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fallbackChain).toEqual(["groq", "openrouter"]);
    }
  });
});

describe("BYOK Resolution", () => {
  it("validates resolution result", () => {
    const resolution = {
      providerId: "openai",
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      modelId: "gpt-4-turbo",
      resolvedAt: "request_override" as const,
      resolvedAtTime: "2025-02-23T10:00:00Z",
    };

    const result = BYOKResolutionSchema.safeParse(resolution);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fallbackUsed).toBe(false);
    }
  });

  it("validates resolution with fallback", () => {
    const resolution = {
      providerId: "groq",
      credentialId: "550e8400-e29b-41d4-a716-446655440001",
      modelId: "mixtral-8x7b-32768",
      resolvedAt: "workspace_preference" as const,
      resolvedAtTime: "2025-02-23T10:00:00Z",
      fallbackUsed: true,
    };

    const result = BYOKResolutionSchema.safeParse(resolution);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fallbackUsed).toBe(true);
    }
  });
});

describe("BYOK Error Taxonomy", () => {
  it("validates error code enum", () => {
    const validCodes: Array<string> = [
      "CREDENTIAL_NOT_FOUND",
      "PROVIDER_NOT_CONNECTED",
      "RATE_LIMIT_EXCEEDED",
      "INTERNAL_ERROR",
    ];

    for (const code of validCodes) {
      const result = BYOKErrorCodeSchema.safeParse(code);
      expect(result.success).toBe(true);
    }
  });

  it("creates error with correct retryability", () => {
    const retryableError = createBYOKError(
      "PROVIDER_UNAVAILABLE",
      "Provider is temporarily unavailable",
    );

    expect(retryableError.retryable).toBe(true);
    expect(isRetryableError("PROVIDER_UNAVAILABLE")).toBe(true);
  });

  it("identifies auth errors", () => {
    const authError = createBYOKError(
      "CREDENTIAL_REVOKED",
      "Credential has been revoked",
    );

    expect(isAuthError("CREDENTIAL_REVOKED")).toBe(true);
    expect(authError.code).toBe("CREDENTIAL_REVOKED");
  });

  it("validates error with correlation ID", () => {
    const error = {
      code: "VALIDATION_ERROR" as const,
      message: "Invalid API key format",
      retryable: false,
      correlationId: "req-123-456",
    };

    const result = BYOKErrorSchema.safeParse(error);
    expect(result.success).toBe(true);
  });
});

describe("Provider Registry", () => {
  it("has known builtin providers", () => {
    expect(Object.keys(BUILTIN_PROVIDERS).length).toBeGreaterThanOrEqual(3);
    expect("openai" in BUILTIN_PROVIDERS).toBe(true);
    expect("groq" in BUILTIN_PROVIDERS).toBe(true);
    expect("openrouter" in BUILTIN_PROVIDERS).toBe(true);
  });

  it("validates provider registry entry", () => {
    const entry = BUILTIN_PROVIDERS.openai;
    const result = ProviderRegistryEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it("finds builtin provider by ID", () => {
    const provider = findBuiltinProvider("openai");
    expect(provider).toBeDefined();
    expect(provider?.displayName).toBe("OpenAI");
    expect(provider?.capabilities.tools).toBe(true);
  });

  it("recognizes known providers", () => {
    expect(isKnownProvider("openai")).toBe(true);
    expect(isKnownProvider("groq")).toBe(true);
    expect(isKnownProvider("unknown-provider")).toBe(false);
  });

  it("returns all known provider IDs", () => {
    const ids = getKnownProviderIds();
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toContain("openai");
    expect(ids).toContain("groq");
    expect(ids).toContain("openrouter");
  });

  it("generates registry with timestamp", () => {
    const registry = getBuiltinRegistry();
    expect(registry.providers.length).toBeGreaterThanOrEqual(3);
    expect(registry.generatedAt).toBeDefined();
    // Validate it's a valid ISO datetime
    expect(new Date(registry.generatedAt).getTime()).toBeGreaterThan(0);
  });
});

describe("BYOK API Contracts", () => {
  it("validates connect request", () => {
    const request = {
      providerId: "openai",
      apiKey: "sk-test123456789",
      label: "My OpenAI Key",
      validationMode: "format" as const,
    };

    const result = BYOKConnectRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it("validates validate request", () => {
    const request = {
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      validationMode: "live" as const,
    };

    const result = BYOKValidateRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });
});

describe("Provider Capabilities", () => {
  it("openai has all capabilities", () => {
    const openai = BUILTIN_PROVIDERS["openai"];
    expect(openai).toBeDefined();
    if (openai) {
      expect(openai.capabilities.streaming).toBe(true);
      expect(openai.capabilities.tools).toBe(true);
      expect(openai.capabilities.jsonMode).toBe(true);
      expect(openai.capabilities.structuredOutputs).toBe(true);
    }
  });

  it("groq has limited capabilities", () => {
    const groq = BUILTIN_PROVIDERS["groq"];
    expect(groq).toBeDefined();
    if (groq) {
      expect(groq.capabilities.streaming).toBe(true);
      expect(groq.capabilities.tools).toBe(true);
      expect(groq.capabilities.jsonMode).toBe(false);
      expect(groq.capabilities.structuredOutputs).toBe(false);
    }
  });

  it("openrouter supports remote model source", () => {
    const openrouter = BUILTIN_PROVIDERS["openrouter"];
    expect(openrouter).toBeDefined();
    if (openrouter) {
      expect(openrouter.modelSource).toBe("remote");
    }
  });
});
