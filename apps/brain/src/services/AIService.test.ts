import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoreMessage } from "ai";
import type { Env } from "../types/ai";
import type { ProviderAdapter } from "./providers";
import { AIService } from "./AIService";
import { ProviderConfigService } from "./providers";
import { DurableProviderStore } from "./providers/DurableProviderStore";

const BASE_MESSAGES: CoreMessage[] = [{ role: "user", content: "hello" }];

function createFakeAdapter(provider: string): ProviderAdapter {
  return {
    provider,
    supportedModels: [],
    supportsModel: () => true,
    generate: vi.fn(async (params: { model?: string }) => ({
      content: `${provider}:${params.model ?? "default"}`,
      usage: {
        provider,
        model: params.model ?? "default",
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
      finishReason: "stop",
    })),
    generateStream: vi.fn(async function* (params: {
      model?: string;
    }): AsyncGenerator<
      {
        type: "text" | "finish";
        content?: string;
        usage?: {
          provider: string;
          model: string;
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
        finishReason?: string;
      },
      {
        content: string;
        usage: {
          provider: string;
          model: string;
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
        finishReason: string;
      },
      unknown
    > {
      const model = params.model ?? "default";
      yield { type: "text", content: `${provider}:${model}` };
      yield {
        type: "finish",
        usage: {
          provider,
          model,
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
        finishReason: "stop",
      };
      return {
        content: `${provider}:${model}`,
        usage: {
          provider,
          model,
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
        finishReason: "stop",
      };
    }),
  };
}

function createEnv(): Env {
  return {
    AI: {} as Env["AI"],
    SECURE_API: {} as Env["SECURE_API"],
    GITHUB_CLIENT_ID: "x",
    GITHUB_CLIENT_SECRET: "x",
    GITHUB_REDIRECT_URI: "x",
    GITHUB_TOKEN_ENCRYPTION_KEY: "x",
    SESSION_SECRET: "x",
    FRONTEND_URL: "x",
    SESSIONS: {} as Env["SESSIONS"],
    RUN_ENGINE_RUNTIME: {} as Env["RUN_ENGINE_RUNTIME"],
    LLM_PROVIDER: "litellm",
    DEFAULT_MODEL: "llama-3.3-70b-versatile",
    GROQ_API_KEY: "test-groq-key",
    OPENAI_API_KEY: "sk-env-openai-key",
  };
}

function createProviderConfigService(): ProviderConfigService {
  const durableStore = new DurableProviderStore(
    createMockDurableObjectState() as any,
    { runId: crypto.randomUUID() },
    "test-byok-encryption-key",
  );
  return new ProviderConfigService(createEnv(), durableStore);
}

function createMockDurableObjectState(): {
  storage: {
    put: (key: string, value: string) => Promise<void>;
    get: (key: string) => Promise<string | undefined>;
    delete: (key: string) => Promise<void>;
    list: (options?: { prefix: string }) => Promise<Map<string, string>>;
  };
} {
  const data = new Map<string, string>();

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

async function readUint8Stream(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    output += decoder.decode(chunk.value, { stream: true });
  }

  return output;
}

vi.mock("./ai", () => ({
  createDefaultAdapter: vi.fn(),
  selectAdapter: vi.fn(),
  resolveModelSelection: vi.fn(
    (
      _providerId?: string,
      _modelId?: string,
      defaultProvider?: string,
      defaultModel?: string,
    ) => ({
      model: _modelId ?? defaultModel ?? "default",
      provider: _providerId ?? defaultProvider ?? "litellm",
      runtimeProvider: _providerId ?? "litellm",
      fallback: false,
      providerId: _providerId,
    }),
  ),
  mapProviderIdToRuntimeProvider: vi.fn((id: string) => id),
  getRuntimeProviderFromAdapter: vi.fn((adapter: string) => adapter),
  generateText: vi.fn(
    async (
      adapter: ProviderAdapter,
      params: { messages: CoreMessage[]; model?: string },
    ) => {
      const result = await adapter.generate({
        messages: params.messages,
        model: params.model,
      });
      return result;
    },
  ),
  createChatStream: vi.fn(
    async (
      adapter: ProviderAdapter,
      params: { messages: CoreMessage[]; model?: string },
    ) => {
      const encoder = new TextEncoder();
      const model = params.model ?? "default";
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode(`${adapter.provider}:${model}`));
          controller.close();
        },
      });
    },
  ),
  getSDKModelConfig: vi.fn(),
}));

import * as aiModule from "./ai";

const mockedAi = vi.mocked(aiModule);

describe("AIService provider override routing", () => {
  let litellmAdapter: ProviderAdapter;
  let openaiAdapter: ProviderAdapter;
  let openrouterAdapter: ProviderAdapter;
  let groqAdapter: ProviderAdapter;

  beforeEach(() => {
    ProviderConfigService.resetForTests();
    vi.clearAllMocks();

    litellmAdapter = createFakeAdapter("litellm");
    openaiAdapter = createFakeAdapter("openai");
    openrouterAdapter = createFakeAdapter("openrouter");
    groqAdapter = createFakeAdapter("groq");

    mockedAi.createDefaultAdapter.mockReturnValue(litellmAdapter);
  });

  it("uses default adapter when no provider override is supplied", async () => {
    const providerConfig = createProviderConfigService();
    const service = new AIService(createEnv(), providerConfig);

    mockedAi.selectAdapter.mockResolvedValue(litellmAdapter);

    const result = await service.generateText({
      messages: BASE_MESSAGES,
    });

    expect(result.usage.provider).toBe("litellm");
    expect(litellmAdapter.generate).toHaveBeenCalledTimes(1);
  });

  it("routes to override provider adapter when provider is connected", async () => {
    const providerConfig = createProviderConfigService();
    await providerConfig.connect({
      providerId: "openai",
      apiKey: "sk-test-1234567890",
    });

    const service = new AIService(createEnv(), providerConfig);
    mockedAi.selectAdapter.mockResolvedValue(openaiAdapter);

    const result = await service.generateText({
      messages: BASE_MESSAGES,
      providerId: "openai",
      model: "gpt-4o",
    });

    expect(result.usage.provider).toBe("openai");
    expect(result.usage.model).toBe("gpt-4o");
    expect(openaiAdapter.generate).toHaveBeenCalledTimes(1);
    expect(litellmAdapter.generate).not.toHaveBeenCalled();
  });

  it("throws ProviderNotConnectedError when override provider is disconnected (strict mode)", async () => {
    const providerConfig = createProviderConfigService();
    const service = new AIService(createEnv(), providerConfig);

    mockedAi.selectAdapter.mockRejectedValue(
      Object.assign(new Error("Provider not connected"), {
        code: "PROVIDER_NOT_CONNECTED",
      }),
    );

    await expect(
      service.generateText({
        messages: BASE_MESSAGES,
        providerId: "openai",
        model: "gpt-4o",
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_NOT_CONNECTED" });

    expect(litellmAdapter.generate).not.toHaveBeenCalled();
    expect(openaiAdapter.generate).not.toHaveBeenCalled();
  });

  it("uses override adapter for stream responses when provider is connected", async () => {
    const providerConfig = createProviderConfigService();
    await providerConfig.connect({
      providerId: "openai",
      apiKey: "sk-test-1234567890",
    });

    const service = new AIService(createEnv(), providerConfig);
    mockedAi.selectAdapter.mockResolvedValue(openaiAdapter);

    const stream = await service.createChatStream({
      messages: BASE_MESSAGES,
      providerId: "openai",
      model: "gpt-4o",
    });

    const content = await readUint8Stream(stream);

    expect(content).toContain("openai");
  });

  describe("Direct OpenRouter and Groq inference (M1.3e)", () => {
    it("routes to OpenRouter adapter when OpenRouter provider is connected", async () => {
      const providerConfig = createProviderConfigService();
      await providerConfig.connect({
        providerId: "openrouter",
        apiKey: "sk-or-test-1234567890",
      });

      const service = new AIService(createEnv(), providerConfig);
      mockedAi.selectAdapter.mockResolvedValue(openrouterAdapter);

      const result = await service.generateText({
        messages: BASE_MESSAGES,
        providerId: "openrouter",
        model: "openai/gpt-4-turbo",
      });

      expect(result.usage.provider).toBe("openrouter");
      expect(result.usage.model).toBe("openai/gpt-4-turbo");
    });

    it("routes to Groq adapter when Groq provider is connected", async () => {
      const providerConfig = createProviderConfigService();
      await providerConfig.connect({
        providerId: "groq",
        apiKey: "gsk_test1234567890",
      });

      const service = new AIService(createEnv(), providerConfig);
      mockedAi.selectAdapter.mockResolvedValue(groqAdapter);

      const result = await service.generateText({
        messages: BASE_MESSAGES,
        providerId: "groq",
        model: "llama-3.3-70b-versatile",
      });

      expect(result.usage.provider).toBe("groq");
      expect(result.usage.model).toBe("llama-3.3-70b-versatile");
    });

    it("throws ProviderNotConnectedError when OpenRouter is not connected (strict mode)", async () => {
      const providerConfig = createProviderConfigService();
      const service = new AIService(createEnv(), providerConfig);

      mockedAi.selectAdapter.mockRejectedValue(
        Object.assign(new Error("Provider not connected"), {
          code: "PROVIDER_NOT_CONNECTED",
        }),
      );

      await expect(
        service.generateText({
          messages: BASE_MESSAGES,
          providerId: "openrouter",
          model: "openai/gpt-4-turbo",
        }),
      ).rejects.toMatchObject({ code: "PROVIDER_NOT_CONNECTED" });
    });

    it("throws ProviderNotConnectedError when Groq is not connected (strict mode)", async () => {
      const providerConfig = createProviderConfigService();
      const service = new AIService(createEnv(), providerConfig);

      mockedAi.selectAdapter.mockRejectedValue(
        Object.assign(new Error("Provider not connected"), {
          code: "PROVIDER_NOT_CONNECTED",
        }),
      );

      await expect(
        service.generateText({
          messages: BASE_MESSAGES,
          providerId: "groq",
          model: "llama-3.3-70b-versatile",
        }),
      ).rejects.toMatchObject({ code: "PROVIDER_NOT_CONNECTED" });
    });

    it("maintains session isolation for provider/model selection", async () => {
      const providerConfig = createProviderConfigService();

      await providerConfig.connect({
        providerId: "groq",
        apiKey: "gsk_test1234567890",
      });
      await providerConfig.connect({
        providerId: "openrouter",
        apiKey: "sk-or-test-1234567890",
      });

      const service = new AIService(createEnv(), providerConfig);

      const selection1 = service.resolveModelSelection(
        "groq",
        "llama-3.3-70b-versatile",
      );
      expect(selection1.providerId).toBe("groq");
      expect(selection1.runtimeProvider).toBe("groq");

      const selection2 = service.resolveModelSelection(
        "openrouter",
        "openai/gpt-4-turbo",
      );
      expect(selection2.providerId).toBe("openrouter");
      expect(selection2.runtimeProvider).toBe("openrouter");

      const selection3 = service.resolveModelSelection("openai", "gpt-4o");
      expect(selection3.providerId).toBe("openai");
      expect(selection3.runtimeProvider).toBe("openai");
    });
  });
});
