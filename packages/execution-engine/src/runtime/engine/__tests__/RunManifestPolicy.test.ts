import { describe, it, expect } from "vitest";
import {
  createRunManifest,
  ensureManifestMatch,
  RunManifestMismatchError,
} from "../RunManifestPolicy.js";
import type { RunInput } from "../../types.js";

describe("RunManifestPolicy", () => {
  const createInput = (overrides?: Partial<RunInput>): RunInput => ({
    agentType: "coding",
    prompt: "test prompt",
    sessionId: "test-session",
    ...overrides,
  });

  describe("createRunManifest", () => {
    it("should create manifest with default execution-engine-v1 backend", () => {
      const input = createInput();
      const manifest = createRunManifest(input);

      expect(manifest.mode).toBe("agentic");
      expect(manifest.orchestratorBackend).toBe("execution-engine-v1");
    });

    it("should support cloudflare_agents backend when specified", () => {
      const input = createInput();
      const manifest = createRunManifest(input, {
        preferredBackend: "cloudflare_agents",
      });

      expect(manifest.orchestratorBackend).toBe("cloudflare_agents");
    });

    it("should normalize provider and model IDs", () => {
      const input = createInput({
        providerId: "  openai  ",
        modelId: "  gpt-4  ",
      });
      const manifest = createRunManifest(input);

      expect(manifest.providerId).toBe("openai");
      expect(manifest.modelId).toBe("gpt-4");
    });

    it("should set null for missing provider and model", () => {
      const input = createInput();
      const manifest = createRunManifest(input);

      expect(manifest.providerId).toBeNull();
      expect(manifest.modelId).toBeNull();
    });

    it("should default to cloudflare-sandbox harness", () => {
      const input = createInput();
      const manifest = createRunManifest(input);

      expect(manifest.harness).toBe("cloudflare-sandbox");
    });

    it("should preserve explicit harness selection", () => {
      const input = createInput({ harnessId: "local-sandbox" });
      const manifest = createRunManifest(input);

      expect(manifest.harness).toBe("local-sandbox");
    });
  });

  describe("ensureManifestMatch", () => {
    it("should not throw when existing is undefined", () => {
      const candidate = createRunManifest(createInput());

      expect(() => {
        ensureManifestMatch(undefined, candidate);
      }).not.toThrow();
    });

    it("should not throw when manifests match exactly", () => {
      const input = createInput({
        providerId: "openai",
        modelId: "gpt-4",
        harnessId: "cloudflare-sandbox",
      });

      const manifest = createRunManifest(input, {
        preferredBackend: "execution-engine-v1",
      });
      const candidate = createRunManifest(input, {
        preferredBackend: "execution-engine-v1",
      });

      expect(() => {
        ensureManifestMatch(manifest, candidate);
      }).not.toThrow();
    });

    it("should throw on orchestratorBackend mismatch", () => {
      const input = createInput();
      const existing = createRunManifest(input, {
        preferredBackend: "execution-engine-v1",
      });
      const candidate = createRunManifest(input, {
        preferredBackend: "cloudflare_agents",
      });

      expect(() => {
        ensureManifestMatch(existing, candidate);
      }).toThrow(RunManifestMismatchError);
    });

    it("should throw on provider mismatch", () => {
      const manifest = createRunManifest(
        createInput({ providerId: "openai" }),
      );
      const candidate = createRunManifest(
        createInput({ providerId: "anthropic" }),
      );

      expect(() => {
        ensureManifestMatch(manifest, candidate);
      }).toThrow(RunManifestMismatchError);
    });

    it("should throw on harness mismatch", () => {
      const manifest = createRunManifest(
        createInput({ harnessId: "cloudflare-sandbox" }),
      );
      const candidate = createRunManifest(
        createInput({ harnessId: "local-sandbox" }),
      );

      expect(() => {
        ensureManifestMatch(manifest, candidate);
      }).toThrow(RunManifestMismatchError);
    });

    it("should throw on model mismatch", () => {
      const manifest = createRunManifest(createInput({ modelId: "gpt-4" }));
      const candidate = createRunManifest(
        createInput({ modelId: "claude-3" }),
      );

      expect(() => {
        ensureManifestMatch(manifest, candidate);
      }).toThrow(RunManifestMismatchError);
    });

    it("should include mismatch details in error message", () => {
      const manifest = createRunManifest(
        createInput({ providerId: "openai" }),
      );
      const candidate = createRunManifest(
        createInput({ providerId: "anthropic" }),
      );

      try {
        ensureManifestMatch(manifest, candidate);
        expect.fail("Should have thrown");
      } catch (error) {
        expect((error as Error).message).toContain("Immutable run manifest mismatch");
        expect((error as Error).message).toContain("openai");
        expect((error as Error).message).toContain("anthropic");
      }
    });
  });
});
