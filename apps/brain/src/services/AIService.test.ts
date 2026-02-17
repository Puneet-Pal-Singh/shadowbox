import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoreMessage } from "ai";
import type { Env } from "../types/ai";
import { AIService } from "./AIService";
import { ProviderConfigService } from "./ProviderConfigService";

interface FakeProviderAdapter {
  provider: string;
  supportedModels: string[];
  supportsModel: (model: string) => boolean;
  generate: ReturnType<typeof vi.fn>;
  generateStream: ReturnType<typeof vi.fn>;
}

interface MutableAIService {
  adapter: FakeProviderAdapter;
  createOpenAIAdapter: (overrideApiKey?: string) => FakeProviderAdapter;
}

const BASE_MESSAGES: CoreMessage[] = [{ role: "user", content: "hello" }];

describe("AIService provider override routing", () => {
  beforeEach(() => {
    ProviderConfigService.resetForTests();
  });

  it("uses default adapter when no provider override is supplied", async () => {
    const providerConfig = new ProviderConfigService(createEnv());
    const service = new AIService(createEnv(), providerConfig);
    const mutableService = service as unknown as MutableAIService;
    const litellmAdapter = createFakeAdapter("litellm");
    const openaiAdapter = createFakeAdapter("openai");

    mutableService.adapter = litellmAdapter;
    mutableService.createOpenAIAdapter = () => openaiAdapter;

    const result = await service.generateText({
      messages: BASE_MESSAGES,
    });

    expect(result.usage.provider).toBe("litellm");
    expect(litellmAdapter.generate).toHaveBeenCalledTimes(1);
    expect(openaiAdapter.generate).not.toHaveBeenCalled();
  });

  it("routes to override provider adapter when provider is connected", async () => {
    const providerConfig = new ProviderConfigService(createEnv());
    await providerConfig.connect({
      providerId: "openai",
      apiKey: "sk-test-1234567890",
    });

    const service = new AIService(createEnv(), providerConfig);
    const mutableService = service as unknown as MutableAIService;
    const litellmAdapter = createFakeAdapter("litellm");
    const openaiAdapter = createFakeAdapter("openai");
    const seenApiKeys: string[] = [];

    mutableService.adapter = litellmAdapter;
    mutableService.createOpenAIAdapter = (overrideApiKey?: string) => {
      seenApiKeys.push(overrideApiKey ?? "");
      return openaiAdapter;
    };

    const result = await service.generateText({
      messages: BASE_MESSAGES,
      providerId: "openai",
      model: "gpt-4o",
    });

    expect(result.usage.provider).toBe("openai");
    expect(result.usage.model).toBe("gpt-4o");
    expect(openaiAdapter.generate).toHaveBeenCalledTimes(1);
    expect(litellmAdapter.generate).not.toHaveBeenCalled();
    expect(seenApiKeys).toEqual(["sk-test-1234567890"]);
  });

  it("falls back to default adapter when override provider is disconnected", async () => {
    const providerConfig = new ProviderConfigService(createEnv());
    const service = new AIService(createEnv(), providerConfig);
    const mutableService = service as unknown as MutableAIService;
    const litellmAdapter = createFakeAdapter("litellm");
    const openaiAdapter = createFakeAdapter("openai");

    mutableService.adapter = litellmAdapter;
    mutableService.createOpenAIAdapter = () => openaiAdapter;

    const result = await service.generateText({
      messages: BASE_MESSAGES,
      providerId: "openai",
      model: "gpt-4o",
    });

    expect(result.usage.provider).toBe("litellm");
    expect(litellmAdapter.generate).toHaveBeenCalledTimes(1);
    expect(openaiAdapter.generate).not.toHaveBeenCalled();
  });

  it("uses override adapter for stream responses when provider is connected", async () => {
    const providerConfig = new ProviderConfigService(createEnv());
    await providerConfig.connect({
      providerId: "openai",
      apiKey: "sk-test-1234567890",
    });

    const service = new AIService(createEnv(), providerConfig);
    const mutableService = service as unknown as MutableAIService;
    const litellmAdapter = createFakeAdapter("litellm");
    const openaiAdapter = createFakeAdapter("openai");

    mutableService.adapter = litellmAdapter;
    mutableService.createOpenAIAdapter = () => openaiAdapter;

    let finishedProvider: string | null = null;
    const stream = await service.createChatStream({
      messages: BASE_MESSAGES,
      providerId: "openai",
      model: "gpt-4o",
      onFinish: async (result) => {
        finishedProvider = result.usage.provider;
      },
    });

    const content = await readUint8Stream(stream);

    expect(content).toContain("openai");
    expect(openaiAdapter.generateStream).toHaveBeenCalledTimes(1);
    expect(litellmAdapter.generateStream).not.toHaveBeenCalled();
    expect(finishedProvider).toBe("openai");
  });
});

function createFakeAdapter(provider: string): FakeProviderAdapter {
  const generate = vi.fn(async (params: { model?: string }) => ({
    content: `${provider}:${params.model ?? "default"}`,
    usage: {
      provider,
      model: params.model ?? "default",
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
    },
    finishReason: "stop",
  }));

  const generateStream = vi.fn(
    async function* (params: { model?: string }): AsyncGenerator<
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
    },
  );

  return {
    provider,
    supportedModels: [],
    supportsModel: () => true,
    generate,
    generateStream,
  };
}

async function readUint8Stream(stream: ReadableStream<Uint8Array>): Promise<string> {
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
