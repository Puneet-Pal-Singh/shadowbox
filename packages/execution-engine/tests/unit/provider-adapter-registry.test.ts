import { describe, it, expect } from "vitest";
import type { ModelInput, ModelOutput, ModelProvider } from "../../src/adapters/index.js";
import {
  ProviderAdapterRegistry,
  DuplicateProviderAdapterRegistrationError,
  InvalidProviderAdapterIdError,
  ProviderAdapterNotRegisteredError,
} from "../../src/adapters/index.js";

class StubProvider implements ModelProvider {
  constructor(private readonly name: string) {}

  getName(): string {
    return this.name;
  }

  async generate(input: ModelInput): Promise<ModelOutput> {
    void input;
    return {
      content: "stub",
      usage: {
        inputTokens: 1,
        outputTokens: 1,
      },
      stopReason: "end_turn",
    };
  }
}

describe("ProviderAdapterRegistry", () => {
  it("registers and resolves adapter by provider id", () => {
    const registry = new ProviderAdapterRegistry();
    registry.register({
      providerId: "openai",
      description: "OpenAI adapter",
      factory: {
        createProvider: () => new StubProvider("OpenAI"),
      },
    });

    const provider = registry.resolve("openai");
    expect(provider.getName()).toBe("OpenAI");
  });

  it("throws for duplicate adapter registration", () => {
    const registry = new ProviderAdapterRegistry();
    const registration = {
      providerId: "openai" as const,
      factory: {
        createProvider: () => new StubProvider("OpenAI"),
      },
    };

    registry.register(registration);
    expect(() => registry.register(registration)).toThrow(
      DuplicateProviderAdapterRegistrationError,
    );
  });

  it("throws for unknown provider resolution", () => {
    const registry = new ProviderAdapterRegistry();

    expect(() => registry.resolve("missing-provider")).toThrow(
      ProviderAdapterNotRegisteredError,
    );
  });

  it("rejects invalid provider ids", () => {
    const registry = new ProviderAdapterRegistry();

    expect(() =>
      registry.register({
        providerId: "OpenAI",
        factory: {
          createProvider: () => new StubProvider("OpenAI"),
        },
      }),
    ).toThrow(InvalidProviderAdapterIdError);
    expect(() => registry.resolve("OpenAI")).toThrow(
      InvalidProviderAdapterIdError,
    );
  });

  it("lists registered adapters with provider-neutral metadata", () => {
    const registry = new ProviderAdapterRegistry();
    registry.register({
      providerId: "openai",
      description: "OpenAI adapter",
      factory: {
        createProvider: () => new StubProvider("OpenAI"),
      },
    });
    registry.register({
      providerId: "localmock",
      description: "Local deterministic adapter",
      factory: {
        createProvider: () => new StubProvider("LocalMock"),
      },
    });

    expect(registry.list()).toEqual([
      { providerId: "openai", description: "OpenAI adapter" },
      { providerId: "localmock", description: "Local deterministic adapter" },
    ]);
  });
});
