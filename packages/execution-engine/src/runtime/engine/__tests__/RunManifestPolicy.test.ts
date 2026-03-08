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
      expect(manifest.executionBackend).toBe("cloudflare_sandbox");
      expect(manifest.harnessMode).toBe("platform_owned");
      expect(manifest.authMode).toBe("api_key");
    });

    it("should support cloudflare_agents backend when specified", () => {
      const input = createInput({ orchestratorBackend: "cloudflare_agents" });
      const manifest = createRunManifest(input);

      expect(manifest.orchestratorBackend).toBe("cloudflare_agents");
    });

    it("should normalize provider and model IDs", () => {
      const input = createInput({
        providerId: "  openai  ",
        modelId: "  gpt-4  ",
        executionBackend: "e2b",
        harnessMode: "delegated",
        authMode: "oauth",
      });
      const manifest = createRunManifest(input);

      expect(manifest.providerId).toBe("openai");
      expect(manifest.modelId).toBe("gpt-4");
      expect(manifest.executionBackend).toBe("e2b");
      expect(manifest.harnessMode).toBe("platform_owned");
      expect(manifest.authMode).toBe("oauth");
    });

    it("allows delegated harness mode only with internal authorization metadata", () => {
      const input = createInput({
        harnessMode: "delegated",
        metadata: {
          internal: { allowDelegatedHarnessMode: true },
        },
      });

      const manifest = createRunManifest(input);
      expect(manifest.harnessMode).toBe("delegated");
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
        executionBackend: "cloudflare_sandbox",
        harnessMode: "platform_owned",
        authMode: "api_key",
      });

      const manifest = createRunManifest(input);
      const candidate = createRunManifest(input);

      expect(() => {
        ensureManifestMatch(manifest, candidate);
      }).not.toThrow();
    });

    it("should throw on orchestratorBackend mismatch", () => {
      const input = createInput();
      const existing = createRunManifest({
        ...input,
        orchestratorBackend: "execution-engine-v1",
      });
      const candidate = createRunManifest({
        ...input,
        orchestratorBackend: "cloudflare_agents",
      });

      expect(() => {
        ensureManifestMatch(existing, candidate);
      }).toThrow(RunManifestMismatchError);
    });

    it("should throw on executionBackend mismatch", () => {
      const input = createInput();
      const existing = createRunManifest({
        ...input,
        executionBackend: "cloudflare_sandbox",
      });
      const candidate = createRunManifest({
        ...input,
        executionBackend: "e2b",
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

    it("should throw on harnessMode mismatch", () => {
      const existing = createRunManifest(
        createInput({ harnessMode: "platform_owned" }),
      );
      const candidate = createRunManifest(
        createInput({
          harnessMode: "delegated",
          metadata: {
            internal: { allowDelegatedHarnessMode: true },
          },
        }),
      );

      expect(() => {
        ensureManifestMatch(existing, candidate);
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
