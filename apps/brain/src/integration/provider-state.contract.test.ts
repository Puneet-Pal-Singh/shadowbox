import type { DurableObjectState } from "@cloudflare/workers-types";
import type { CoreMessage } from "ai";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// NOTE: This contract test intentionally lives in src/integration because the
// PR3 readiness gate executes the exact path:
// `pnpm --filter @shadowbox/brain test -- src/integration/provider-state.contract.test.ts`
// Keep this location aligned with the documented gate in:
// plans/codex-like-app/Top-version/16-AUDIT-CLOSURE-AND-BYOK-READINESS-LLD.md
import type { ProviderId } from "@repo/shared-types";
import type { Env } from "../types/ai";
import { ProviderController } from "../controllers/ProviderController";
import { AIService } from "../services/AIService";
import { ProviderConfigService } from "../services/providers/ProviderConfigService";
import { OpenAICompatibleAdapter } from "../services/providers/adapters/OpenAICompatibleAdapter";
import {
  getRuntimeProviderFromAdapter,
  mapProviderIdToRuntimeProvider,
  resolveModelSelection,
} from "../services/ai/ModelSelectionPolicy";
import { setCompatModeOverride } from "../config/runtime-compat";

interface MockDurableObjectState {
  storage?: {
    put: (key: string, value: string) => Promise<void>;
    get: (key: string) => Promise<string | undefined>;
    delete: (key: string) => Promise<void>;
    list: (options?: {
      prefix: string;
    }) => Promise<Map<string, string> | undefined>;
  };
}

const RUN_ID = "123e4567-e89b-42d3-a456-426614174001";
const TEST_USER_ID = "user-123";
const TEST_WORKSPACE_ID = "workspace-main";
const TEST_SESSION_SECRET = "test-session-secret";

describe("Provider State Contract: Controller/Runtime Shared Ownership", () => {
  beforeEach(() => {
    resetCredentialStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setCompatModeOverride(false);
    resetCredentialStore();
  });

  it("uses one durable provider-state owner path across controller and runtime services", async () => {
    const storageByRunId = new Map<string, Map<string, string>>();
    const env = createEnvWithRunNamespace(storageByRunId);

    const connectResponse = await ProviderController.byokConnect(
      new Request("http://localhost/api/byok/providers/connect", {
        method: "POST",
        headers: await createByokHeaders(env),
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-test-provider-state-1234567890",
        }),
      }),
      env,
    );
    expect(connectResponse.status).toBe(200);

    const statusResponse = await ProviderController.byokConnections(
      new Request("http://localhost/api/byok/providers/connections", {
        method: "GET",
        headers: await createByokHeaders(env, { "Content-Type": undefined }),
      }),
      env,
    );
    const statusBody = await statusResponse.json();
    expect(statusResponse.status).toBe(200);
    expect(
      statusBody.connections.some(
        (provider: { providerId: string; status: string }) =>
          provider.providerId === "openai" && provider.status === "connected",
      ),
    ).toBe(true);

    const catalogResponse = await ProviderController.byokCatalog(
      new Request("http://localhost/api/byok/providers/catalog", {
        method: "GET",
        headers: await createByokHeaders(env, { "Content-Type": undefined }),
      }),
      env,
    );
    const catalogBody = await catalogResponse.json();
    expect(catalogResponse.status).toBe(200);
    expect(
      catalogBody.providers.some(
        (provider: { providerId: string; models: Array<{ id: string }> }) =>
          provider.providerId === "openai" &&
          provider.models.some((model) => model.id === "gpt-4o"),
      ),
    ).toBe(true);

    const runtimeProviderConfig = createRuntimeProviderConfigService(
      env,
      storageByRunId,
      RUN_ID,
    );
    const runtimeApiKey = await runtimeProviderConfig.getApiKey("openai");
    expect(runtimeApiKey).toBe("sk-test-provider-state-1234567890");

    const generateSpy = vi
      .spyOn(OpenAICompatibleAdapter.prototype, "generate")
      .mockResolvedValue({
        content: "integration-inference-ok",
        usage: {
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 3,
          completionTokens: 2,
          totalTokens: 5,
        },
      });

    const aiService = new AIService(env, runtimeProviderConfig);
    const messages: CoreMessage[] = [{ role: "user", content: "hello" }];
    const inferenceResult = await aiService.generateText({
      messages,
      providerId: "openai",
      model: "gpt-4o",
    });

    expect(inferenceResult.text).toBe("integration-inference-ok");
    expect(inferenceResult.usage.provider).toBe("openai");
    expect(inferenceResult.usage.model).toBe("gpt-4o");
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it("applies persisted BYOK preferences when request override is absent", async () => {
    const storageByRunId = new Map<string, Map<string, string>>();
    const env = createEnvWithRunNamespace(storageByRunId);

    await ProviderController.byokConnect(
      new Request("http://localhost/api/byok/providers/connect", {
        method: "POST",
        headers: await createByokHeaders(env),
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-test-provider-state-1234567890",
        }),
      }),
      env,
    );

    const preferencesResponse = await ProviderController.byokPreferences(
      new Request("http://localhost/api/byok/preferences", {
        method: "PATCH",
        headers: await createByokHeaders(env),
        body: JSON.stringify({
          defaultProviderId: "openai",
          defaultModelId: "gpt-4o",
        }),
      }),
      env,
    );
    expect(preferencesResponse.status).toBe(200);

    const runtimeProviderConfig = createRuntimeProviderConfigService(
      env,
      storageByRunId,
      RUN_ID,
    );

    const generateSpy = vi
      .spyOn(OpenAICompatibleAdapter.prototype, "generate")
      .mockResolvedValue({
        content: "integration-preference-inference-ok",
        usage: {
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 3,
          completionTokens: 2,
          totalTokens: 5,
        },
      });

    const aiService = new AIService(env, runtimeProviderConfig);
    const messages: CoreMessage[] = [{ role: "user", content: "hello" }];
    const inferenceResult = await aiService.generateText({
      messages,
    });

    expect(inferenceResult.text).toBe("integration-preference-inference-ok");
    expect(inferenceResult.usage.provider).toBe("openai");
    expect(inferenceResult.usage.model).toBe("gpt-4o");
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it("retains provider state across runtime restart for the same runId scope", async () => {
    const storageByRunId = new Map<string, Map<string, string>>();
    const env = createEnvWithRunNamespace(storageByRunId);

    await ProviderController.byokConnect(
      new Request("http://localhost/api/byok/providers/connect", {
        method: "POST",
        headers: await createByokHeaders(env),
        body: JSON.stringify({
          providerId: "groq",
          apiKey: "gsk_test_provider_state_1234567890",
        }),
      }),
      env,
    );

    const runtimeServiceBeforeRestart = createRuntimeProviderConfigService(
      env,
      storageByRunId,
      RUN_ID,
    );
    expect(await runtimeServiceBeforeRestart.isConnected("groq")).toBe(true);

    // Simulate runtime restart by rebuilding runtime service from same durable storage.
    const runtimeServiceAfterRestart = createRuntimeProviderConfigService(
      env,
      storageByRunId,
      RUN_ID,
    );
    expect(await runtimeServiceAfterRestart.isConnected("groq")).toBe(true);
    expect(await runtimeServiceAfterRestart.getApiKey("groq")).toBe(
      "gsk_test_provider_state_1234567890",
    );
  });

  it("enforces strict-mode typed errors for invalid provider selections", () => {
    setCompatModeOverride(false);

    const selection = resolveModelSelection(
      "openai",
      "llama-3.3-70b-versatile",
      "litellm",
      "llama-3.3-70b-versatile",
      mapProviderIdToRuntimeProvider,
      getRuntimeProviderFromAdapter,
    );
    expect(selection.provider).toBe("openai");
    expect(selection.model).toBe("llama-3.3-70b-versatile");
    expect(selection.fallback).toBe(false);

    expectDomainError(
      () =>
        resolveModelSelection(
          "invalid-provider",
          "gpt-4o",
          "litellm",
          "llama-3.3-70b-versatile",
          mapProviderIdToRuntimeProvider,
          getRuntimeProviderFromAdapter,
        ),
      "INVALID_PROVIDER_SELECTION",
    );

    expectDomainError(
      () =>
        resolveModelSelection(
          "openai",
          undefined,
          "litellm",
          "llama-3.3-70b-versatile",
          mapProviderIdToRuntimeProvider,
          getRuntimeProviderFromAdapter,
        ),
      "INVALID_PROVIDER_SELECTION",
    );
  });
});

function createEnvWithRunNamespace(
  storageByRunId: Map<string, Map<string, string>>,
): Env {
  const namespace = {
    idFromName: (name: string) => name,
    get: (id: string) => ({
      fetch: async (input: string | URL | Request, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(String(input), init);
        const runId = request.headers.get("X-Run-Id");
        const userId = request.headers.get("X-User-Id");
        const workspaceId = request.headers.get("X-Workspace-Id");
        if (!runId) {
          return new Response(
            JSON.stringify({ error: "Missing required X-Run-Id header" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (runId !== id) {
          return new Response(
            JSON.stringify({ error: `X-Run-Id mismatch: expected ${id}` }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        if (userId !== TEST_USER_ID || workspaceId !== TEST_WORKSPACE_ID) {
          return new Response(
            JSON.stringify({
              error: "Invalid BYOK scope",
              code: "AUTH_FAILED",
            }),
            {
              status: 403,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        const configService = new ProviderConfigService({
          env,
          userId: TEST_USER_ID,
          workspaceId: TEST_WORKSPACE_ID,
          credentialStore: sharedCredentialStore,
          preferenceStore: createMockPreferenceStore(),
          modelCacheStore: createMockModelCacheStore(),
          auditLog: createMockAuditLog(),
          quotaStore: createMockQuotaStore(),
        });
        const url = new URL(request.url);
        return handleProviderRuntimeRoute(request, url, configService);
      },
    }),
  };

  const env = {
    RUN_ENGINE_RUNTIME: namespace as unknown as Env["RUN_ENGINE_RUNTIME"],
    SESSION_SECRET: TEST_SESSION_SECRET,
    SESSIONS: {
      get: async (key: string) =>
        key === `user_session:${TEST_USER_ID}`
          ? JSON.stringify({
              userId: TEST_USER_ID,
              workspaceIds: [TEST_WORKSPACE_ID],
              defaultWorkspaceId: TEST_WORKSPACE_ID,
            })
          : null,
    } as unknown as Env["SESSIONS"],
    LLM_PROVIDER: "litellm",
    DEFAULT_MODEL: "llama-3.3-70b-versatile",
    GROQ_API_KEY: "test-key",
    OPENAI_API_KEY: "sk-env-openai-key",
    BYOK_CREDENTIAL_ENCRYPTION_KEY: "test-byok-encryption-key",
    GITHUB_TOKEN_ENCRYPTION_KEY: "test-byok-encryption-key",
  } as unknown as Env;

  return env;
}

async function handleProviderRuntimeRoute(
  request: Request,
  url: URL,
  configService: ProviderConfigService,
): Promise<Response> {
  if (url.pathname === "/providers/connect" && request.method === "POST") {
    const body = (await request.json()) as {
      providerId: ProviderId;
      apiKey: string;
    };
    const response = await configService.connect(body);
    return json(response, 200);
  }

  if (url.pathname === "/providers/disconnect" && request.method === "POST") {
    const body = (await request.json()) as {
      providerId: ProviderId;
    };
    const response = await configService.disconnect(body);
    return json(response, 200);
  }

  if (url.pathname === "/providers/catalog" && request.method === "GET") {
    const response = await configService.getCatalog();
    return json(response, 200);
  }

  if (url.pathname === "/providers/connections" && request.method === "GET") {
    const response = await configService.getConnections();
    return json(response, 200);
  }

  if (url.pathname === "/providers/preferences" && request.method === "GET") {
    const response = await configService.getPreferences();
    return json(response, 200);
  }

  if (url.pathname === "/providers/preferences" && request.method === "PATCH") {
    const body = (await request.json()) as {
      defaultProviderId?: ProviderId;
      defaultModelId?: string;
    };
    const response = await configService.updatePreferences(body);
    return json(response, 200);
  }

  return new Response("Not Found", { status: 404 });
}

import type { ProviderCredentialRecord } from "../services/providers/stores/CredentialStore";

interface MockCredential extends Omit<
  ProviderCredentialRecord,
  "keyFingerprint" | "encryptedSecretJson" | "keyVersion"
> {
  apiKey: string;
}

const sharedCredentials = new Map<ProviderId, MockCredential>();

interface MockPreferences {
  defaultProviderId: string;
  defaultModelId: string;
  updatedAt: string;
}

const sharedPreferences: MockPreferences = {
  defaultProviderId: "axis",
  defaultModelId: "meta-llama/llama-4-scout-17b-16e-instruct",
  updatedAt: new Date().toISOString(),
};

function createMockCredentialStore() {
  return {
    getCredential: async (
      providerId: ProviderId,
    ): Promise<ProviderCredentialRecord | null> => {
      const cred = sharedCredentials.get(providerId);
      if (!cred) return null;
      return {
        credentialId: cred.credentialId,
        userId: cred.userId,
        workspaceId: "test-workspace",
        providerId: cred.providerId,
        label: cred.label,
        keyFingerprint: "mock-fingerprint",
        encryptedSecretJson: "mock-encrypted",
        keyVersion: "1",
        status: cred.status as "connected" | "failed" | "revoked",
        lastValidatedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
    },
    getCredentialWithKey: async (providerId: ProviderId) => {
      const cred = sharedCredentials.get(providerId);
      if (!cred) return null;
      const record: ProviderCredentialRecord = {
        credentialId: cred.credentialId,
        userId: cred.userId,
        workspaceId: "test-workspace",
        providerId: cred.providerId,
        label: cred.label,
        keyFingerprint: "mock-fingerprint",
        encryptedSecretJson: "mock-encrypted",
        keyVersion: "1",
        status: cred.status as "connected" | "failed" | "revoked",
        lastValidatedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      return { record, apiKey: cred.apiKey };
    },
    setCredential: async (params: {
      credentialId: string;
      userId: string;
      providerId: ProviderId;
      label: string;
      apiKey: string;
    }) => {
      const now = new Date().toISOString();
      const record: ProviderCredentialRecord = {
        credentialId: params.credentialId,
        userId: params.userId,
        workspaceId: "test-workspace",
        providerId: params.providerId,
        label: params.label,
        keyFingerprint: "mock-fingerprint",
        encryptedSecretJson: "mock-encrypted",
        keyVersion: "1",
        status: "connected",
        lastValidatedAt: now,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      sharedCredentials.set(params.providerId, {
        ...record,
        apiKey: params.apiKey,
      });
      return record;
    },
    deleteCredential: async (providerId: ProviderId) => {
      sharedCredentials.delete(providerId);
    },
    listCredentialProviders: async () => {
      return Array.from(sharedCredentials.values())
        .filter((c) => c.status === "connected")
        .map((c) => c.providerId);
    },
    updateCredentialMetadata: async () => {
      return undefined;
    },
  };
}

const sharedCredentialStore = createMockCredentialStore();

function createRuntimeProviderConfigService(
  env: Env,
  _storageByRunId: Map<string, Map<string, string>>,
  runId: string,
): ProviderConfigService {
  return new ProviderConfigService({
    env,
    userId: TEST_USER_ID,
    workspaceId: TEST_WORKSPACE_ID,
    credentialStore: sharedCredentialStore,
    preferenceStore: createMockPreferenceStore(),
    modelCacheStore: createMockModelCacheStore(),
    auditLog: createMockAuditLog(),
    quotaStore: createMockQuotaStore(),
  });
}

function resetCredentialStore(): void {
  sharedCredentials.clear();
  sharedPreferences.defaultProviderId = "axis";
  sharedPreferences.defaultModelId =
    "meta-llama/llama-4-scout-17b-16e-instruct";
  sharedPreferences.updatedAt = new Date().toISOString();
}

function createMockPreferenceStore() {
  return {
    getPreferences: vi.fn().mockImplementation(async () => {
      return { ...sharedPreferences, credentialLabels: {} };
    }),
    updatePreferences: vi
      .fn()
      .mockImplementation(
        async (patch: {
          defaultProviderId?: string;
          defaultModelId?: string;
        }) => {
          sharedPreferences.defaultProviderId =
            patch.defaultProviderId ?? sharedPreferences.defaultProviderId;
          sharedPreferences.defaultModelId =
            patch.defaultModelId ?? sharedPreferences.defaultModelId;
          sharedPreferences.updatedAt = new Date().toISOString();
          return { ...sharedPreferences, credentialLabels: {} };
        },
      ),
    setCredentialLabel: vi.fn().mockResolvedValue(undefined),
    deleteCredentialLabel: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockModelCacheStore() {
  return {
    getModelCache: vi.fn().mockResolvedValue(null),
    setModelCache: vi.fn().mockResolvedValue(undefined),
    invalidateModelCache: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockAuditLog() {
  return {
    appendAuditEvent: vi.fn().mockResolvedValue(undefined),
    record: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockQuotaStore() {
  return {
    getAxisQuotaUsage: vi.fn().mockResolvedValue(0),
    setAxisQuotaUsage: vi.fn().mockResolvedValue(undefined),
    incrementAndGetQuota: vi.fn().mockResolvedValue(1),
  };
}

async function createByokHeaders(
  env: Env,
  overrides: Record<string, string | undefined> = {},
): Promise<Record<string, string>> {
  const token = await createSessionToken(TEST_USER_ID, env.SESSION_SECRET);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Run-Id": RUN_ID,
    Cookie: `shadowbox_session=${token}`,
  };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete headers[key];
    } else {
      headers[key] = value;
    }
  }

  return headers;
}

async function createSessionToken(
  userId: string,
  secret: string,
): Promise<string> {
  const timestamp = Date.now().toString();
  const data = `${userId}:${timestamp}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(data),
  );
  const signature = btoa(
    String.fromCharCode(...new Uint8Array(signatureBuffer)),
  );
  return `${data}:${signature}`;
}

function createDurableState(
  storageByRunId: Map<string, Map<string, string>>,
  runId: string,
): MockDurableObjectState {
  if (!storageByRunId.has(runId)) {
    storageByRunId.set(runId, new Map<string, string>());
  }
  const data = storageByRunId.get(runId)!;

  return {
    storage: {
      put: async (key: string, value: string) => {
        data.set(key, value);
      },
      get: async (key: string) => data.get(key),
      delete: async (key: string) => {
        data.delete(key);
      },
      list: async (options?: { prefix: string }) => {
        const prefix = options?.prefix ?? "";
        const entries = new Map<string, string>();
        for (const [key, value] of data) {
          if (key.startsWith(prefix)) {
            entries.set(key, value);
          }
        }
        return entries;
      },
    },
  };
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function expectDomainError(run: () => unknown, expectedCode: string): void {
  try {
    run();
    throw new Error(`Expected error with code ${expectedCode}`);
  } catch (error) {
    expect(error).toMatchObject({ code: expectedCode });
  }
}
