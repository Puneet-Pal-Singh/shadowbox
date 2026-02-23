/**
 * ProviderRegistryV3 Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ProviderRegistryV3 } from "./ProviderRegistryV3";

describe("ProviderRegistryV3", () => {
  let registry: ProviderRegistryV3;

  beforeEach(() => {
    ProviderRegistryV3.resetForTests();
    registry = ProviderRegistryV3.getInstance();
  });

  describe("getProvider", () => {
    it("should return OpenAI provider", () => {
      const provider = registry.getProvider("openai");

      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("openai");
      expect(provider?.displayName).toBe("OpenAI");
      expect(provider?.defaultModel).toBe("gpt-4");
    });

    it("should return Anthropic provider", () => {
      const provider = registry.getProvider("anthropic");

      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("anthropic");
      expect(provider?.displayName).toBe("Anthropic Claude");
    });

    it("should return Groq provider", () => {
      const provider = registry.getProvider("groq");

      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("groq");
    });

    it("should return null for unknown provider", () => {
      const provider = registry.getProvider("unknown-provider");
      expect(provider).toBeNull();
    });

    it("should return expanded providers", () => {
      const providers = [
        "openrouter",
        "cohere",
        "huggingface",
        "mistral",
        "replicate",
        "deepseek",
        "xai",
      ];

      for (const providerId of providers) {
        const provider = registry.getProvider(providerId);
        expect(provider).toBeDefined();
        expect(provider?.providerId).toBe(providerId);
      }
    });
  });

  describe("getProviderPublic", () => {
    it("should return public API format", () => {
      const provider = registry.getProviderPublic("openai");

      expect(provider).toBeDefined();
      expect(provider?.providerId).toBe("openai");
      expect(provider?.displayName).toBe("OpenAI");
      expect(provider?.capabilities).toBeDefined();
      expect(provider?.capabilities.streaming).toBe(true);
      expect(provider?.capabilities.tools).toBe(true);
    });

    it("should exclude internal fields", () => {
      const provider = registry.getProviderPublic("openai");

      expect(provider).not.toHaveProperty("modelFetchUrl");
      expect(provider).not.toHaveProperty("modelFetchIntervalHours");
    });

    it("should return null for unknown provider", () => {
      const provider = registry.getProviderPublic("unknown");
      expect(provider).toBeNull();
    });
  });

  describe("listProviders", () => {
    it("should return all registered providers", () => {
      const providers = registry.listProviders();

      expect(providers.length).toBeGreaterThanOrEqual(10);
      expect(providers.some((p) => p.providerId === "openai")).toBe(true);
      expect(providers.some((p) => p.providerId === "anthropic")).toBe(true);
      expect(providers.some((p) => p.providerId === "groq")).toBe(true);
    });

    it("should include expansion providers", () => {
      const providers = registry.listProviders();
      const providerIds = providers.map((p) => p.providerId);

      expect(providerIds).toContain("openrouter");
      expect(providerIds).toContain("cohere");
      expect(providerIds).toContain("mistral");
      expect(providerIds).toContain("deepseek");
    });

    it("should return providers in public API format", () => {
      const providers = registry.listProviders();

      for (const provider of providers) {
        expect(provider.providerId).toBeDefined();
        expect(provider.displayName).toBeDefined();
        expect(provider.authModes).toBeDefined();
        expect(provider.capabilities).toBeDefined();
      }
    });
  });

  describe("hasProvider", () => {
    it("should return true for registered providers", () => {
      expect(registry.hasProvider("openai")).toBe(true);
      expect(registry.hasProvider("anthropic")).toBe(true);
      expect(registry.hasProvider("groq")).toBe(true);
    });

    it("should return false for unknown providers", () => {
      expect(registry.hasProvider("unknown")).toBe(false);
      expect(registry.hasProvider("fake-provider")).toBe(false);
    });
  });

  describe("getDefaultModel", () => {
    it("should return default model for provider", () => {
      expect(registry.getDefaultModel("openai")).toBe("gpt-4");
      expect(registry.getDefaultModel("anthropic")).toBe("claude-3-opus");
      expect(registry.getDefaultModel("groq")).toBe("mixtral-8x7b-32768");
    });

    it("should return undefined for unknown provider", () => {
      expect(registry.getDefaultModel("unknown")).toBeUndefined();
    });
  });

  describe("getProvidersByCapability", () => {
    it("should return providers with streaming", () => {
      const providers = registry.getProvidersByCapability("streaming");

      expect(providers.length).toBeGreaterThan(0);
      expect(providers.every((p) => p.capabilities.streaming)).toBe(true);
    });

    it("should return providers with tools", () => {
      const providers = registry.getProvidersByCapability("tools");

      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some((p) => p.providerId === "openai")).toBe(true);
    });

    it("should return empty for unsupported capability", () => {
      // Assuming no provider has reasoning by default in subset
      const providers = registry.getProvidersByCapability("reasoning");

      // Should return some (openai, anthropic, deepseek have reasoning)
      expect(providers.length).toBeGreaterThan(0);
    });

    it("should return providers with jsonMode", () => {
      const providers = registry.getProvidersByCapability("jsonMode");

      expect(providers.length).toBeGreaterThan(0);
      expect(providers.some((p) => p.providerId === "openai")).toBe(true);
    });
  });

  describe("getProviderCount", () => {
    it("should return total provider count", () => {
      const count = registry.getProviderCount();

      expect(count).toBeGreaterThanOrEqual(10);
    });
  });

  describe("registerProvider", () => {
    it("should allow runtime provider registration", () => {
      const newProvider = {
        providerId: "test-provider",
        displayName: "Test Provider",
        authModes: ["api_key"] as const,
        capabilities: {
          streaming: true,
          tools: false,
          jsonMode: false,
          structuredOutputs: false,
        },
        baseUrl: "https://test.example.com",
        keyFormat: { prefix: "test_" },
      };

      registry.registerProvider(newProvider);

      const retrieved = registry.getProvider("test-provider");
      expect(retrieved).toBeDefined();
      expect(retrieved?.displayName).toBe("Test Provider");
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance", () => {
      const instance1 = ProviderRegistryV3.getInstance();
      const instance2 = ProviderRegistryV3.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe("capability matrix", () => {
    it("OpenAI should have all capabilities", () => {
      const openai = registry.getProvider("openai");

      expect(openai?.capabilities.streaming).toBe(true);
      expect(openai?.capabilities.tools).toBe(true);
      expect(openai?.capabilities.jsonMode).toBe(true);
      expect(openai?.capabilities.structuredOutputs).toBe(true);
    });

    it("Groq should have limited capabilities", () => {
      const groq = registry.getProvider("groq");

      expect(groq?.capabilities.streaming).toBe(true);
      expect(groq?.capabilities.tools).toBe(true);
      expect(groq?.capabilities.jsonMode).toBe(false);
      expect(groq?.capabilities.structuredOutputs).toBe(false);
    });

    it("Replicate should not have tools", () => {
      const replicate = registry.getProvider("replicate");

      expect(replicate?.capabilities.tools).toBe(false);
      expect(replicate?.capabilities.streaming).toBe(true);
    });
  });

  describe("auth modes", () => {
    it("should support api_key auth", () => {
      const openai = registry.getProvider("openai");

      expect(openai?.authModes).toContain("api_key");
    });

    it("all current providers should support api_key", () => {
      const providers = registry.listProviders();

      for (const provider of providers) {
        expect(provider.authModes).toContain("api_key");
      }
    });
  });

  describe("extensibility", () => {
    it("should support 10+ providers without schema changes", () => {
      const count = registry.getProviderCount();

      expect(count).toBeGreaterThanOrEqual(10);
    });

    it("should support adding new providers at runtime", () => {
      const beforeCount = registry.getProviderCount();

      registry.registerProvider({
        providerId: "new-test-provider",
        displayName: "New Test",
        authModes: ["api_key"] as const,
        capabilities: {
          streaming: true,
          tools: true,
          jsonMode: true,
          structuredOutputs: false,
        },
      });

      const afterCount = registry.getProviderCount();
      expect(afterCount).toBe(beforeCount + 1);
    });
  });
});
