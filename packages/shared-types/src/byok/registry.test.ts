import { describe, it, expect } from "vitest";
import {
  ProviderRegistryEntrySchema,
  BUILTIN_PROVIDERS,
  getBuiltinRegistry,
  findBuiltinProvider,
  isKnownProvider,
  getKnownProviderIds,
} from "./registry.js";

describe("Provider Registry", () => {
  it("has known builtin providers", () => {
    expect(Object.keys(BUILTIN_PROVIDERS).length).toBeGreaterThanOrEqual(3);
    expect("axis" in BUILTIN_PROVIDERS).toBe(true);
    expect("openai" in BUILTIN_PROVIDERS).toBe(true);
    expect("groq" in BUILTIN_PROVIDERS).toBe(true);
    expect("openrouter" in BUILTIN_PROVIDERS).toBe(true);
  });

  it("validates provider registry entry", () => {
    const entry = BUILTIN_PROVIDERS["openai"];
    expect(entry).toBeDefined();
    if (entry) {
      const result = ProviderRegistryEntrySchema.safeParse(entry);
      expect(result.success).toBe(true);
    }
  });

  it("finds builtin provider by ID", () => {
    const provider = findBuiltinProvider("openai");
    expect(provider).toBeDefined();
    if (provider) {
      expect(provider.displayName).toBe("OpenAI");
      expect(provider.capabilities.tools).toBe(true);
    }
  });

  it("recognizes known providers", () => {
    expect(isKnownProvider("axis")).toBe(true);
    expect(isKnownProvider("openai")).toBe(true);
    expect(isKnownProvider("groq")).toBe(true);
    expect(isKnownProvider("unknown-provider")).toBe(false);
  });

  it("returns all known provider IDs", () => {
    const ids = getKnownProviderIds();
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(ids).toContain("axis");
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

  it("axis uses platform managed auth mode", () => {
    const axis = BUILTIN_PROVIDERS["axis"];
    expect(axis).toBeDefined();
    if (axis) {
      expect(axis.authModes).toEqual(["platform_managed"]);
      expect(axis.defaultModelId).toBe("z-ai/glm-4.5-air:free");
    }
  });
});
