import { describe, expect, it, vi } from "vitest";
import type { CoreMessage } from "ai";
import { LLMGateway, ProviderCapabilityError } from "./LLMGateway.js";
import type { LLMGatewayDependencies } from "./LLMGateway.js";
import type { ProviderCapabilityResolver } from "./types.js";

const baseRequest = {
  context: {
    runId: "run-1",
    sessionId: "session-1",
    agentType: "planner",
    phase: "task" as const,
  },
  providerId: "openai",
  model: "gpt-4o",
  messages: [{ role: "user", content: "hello" }] as CoreMessage[],
};

describe("LLMGateway provider capabilities", () => {
  it("throws MODEL_NOT_ALLOWED when capability resolver rejects provider/model pair", async () => {
    const gateway = new LLMGateway(
      createDependencies({
        getCapabilities: () => ({
          streaming: true,
          tools: true,
          structuredOutputs: true,
          jsonMode: true,
        }),
        isModelAllowed: () => false,
      }),
    );

    const result = gateway.generateText(baseRequest);
    await expect(result).rejects.toBeInstanceOf(ProviderCapabilityError);
    await expect(result).rejects.toMatchObject({
      code: "MODEL_NOT_ALLOWED",
    });
  });

  it("throws INVALID_PROVIDER_SELECTION when resolver has no provider capabilities", async () => {
    const gateway = new LLMGateway(
      createDependencies({
        getCapabilities: () => undefined,
        isModelAllowed: () => false,
      }),
    );

    await expect(gateway.generateText(baseRequest)).rejects.toMatchObject({
      code: "INVALID_PROVIDER_SELECTION",
    });
  });

  it("allows generation when resolver accepts model", async () => {
    const deps = createDependencies({
      getCapabilities: () => ({
        streaming: true,
        tools: true,
        structuredOutputs: true,
        jsonMode: true,
      }),
      isModelAllowed: () => true,
    });
    const gateway = new LLMGateway(deps);

    const response = await gateway.generateText(baseRequest);

    expect(response.text).toBe("ok");
    expect(deps.aiService.generateText).toHaveBeenCalledTimes(1);
  });
});

function createDependencies(
  resolver: ProviderCapabilityResolver,
): LLMGatewayDependencies & {
  aiService: {
    generateText: ReturnType<typeof vi.fn>;
  };
} {
  return {
    aiService: {
      getProvider: () => "openai",
      getDefaultModel: () => "gpt-4o",
      generateText: vi.fn().mockResolvedValue({
        text: "ok",
        usage: {
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
      }),
      generateStructured: vi.fn(),
      createChatStream: vi.fn(),
    },
    budgetPolicy: {
      preflight: vi.fn().mockResolvedValue(undefined),
      postCommit: vi.fn().mockResolvedValue(undefined),
    },
    costLedger: {
      append: vi.fn().mockResolvedValue(true),
      getEvents: vi.fn(),
      aggregate: vi.fn(),
      getCurrentCost: vi.fn(),
    },
    pricingResolver: {
      resolve: vi.fn().mockReturnValue({
        providerCostUsd: 0.01,
        calculatedCostUsd: 0.01,
        pricingSource: "registry",
        shouldBlock: false,
      }),
    },
    providerCapabilityResolver: {
      getCapabilities: resolver.getCapabilities,
      isModelAllowed: resolver.isModelAllowed,
    },
  };
}
