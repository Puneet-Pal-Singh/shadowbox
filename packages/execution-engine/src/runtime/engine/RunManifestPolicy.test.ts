import { describe, expect, it } from "vitest";
import {
  RunManifestMismatchError,
  createRunManifest,
  ensureManifestMatch,
} from "./RunManifestPolicy.js";
import type { RuntimeHarnessId } from "../types.js";

const PROVIDERS = ["openai", "groq"] as const;
const HARNESSES = ["cloudflare-sandbox", "local-sandbox"] as const satisfies RuntimeHarnessId[];

describe("RunManifestPolicy matrix conformance", () => {
  it("creates deterministic run manifests across provider/harness matrix", () => {
    for (const providerId of PROVIDERS) {
      for (const harnessId of HARNESSES) {
        const manifest = createRunManifest({
          agentType: "coding",
          prompt: "check readme",
          sessionId: "session-1",
          providerId,
          modelId: `${providerId}-model`,
          harnessId,
        });

        expect(manifest.providerId).toBe(providerId);
        expect(manifest.mode).toBe("build");
        expect(manifest.modelId).toBe(`${providerId}-model`);
        expect(manifest.harness).toBe(harnessId);
        expect(manifest.orchestratorBackend).toBe("execution-engine-v1");
        expect(manifest.executionBackend).toBe("cloudflare_sandbox");
        expect(manifest.harnessMode).toBe("platform_owned");
        expect(manifest.authMode).toBe("api_key");
      }
    }
  });

  it("rejects active-run manifest drift when harness or provider changes", () => {
    const existing = createRunManifest({
      agentType: "coding",
      prompt: "run once",
      sessionId: "session-1",
      providerId: "openai",
      modelId: "gpt-4o",
      harnessId: "cloudflare-sandbox",
    });

    const changedHarness = createRunManifest({
      agentType: "coding",
      prompt: "same run",
      sessionId: "session-1",
      providerId: "openai",
      modelId: "gpt-4o",
      harnessId: "local-sandbox",
    });

    const changedProvider = createRunManifest({
      agentType: "coding",
      prompt: "same run",
      sessionId: "session-1",
      providerId: "groq",
      modelId: "llama-3.3-70b-versatile",
      harnessId: "cloudflare-sandbox",
    });

    expect(() => ensureManifestMatch(existing, changedHarness)).toThrow(
      RunManifestMismatchError,
    );
    expect(() => ensureManifestMatch(existing, changedProvider)).toThrow(
      RunManifestMismatchError,
    );
  });

  it("rejects active-run manifest drift when build/plan mode changes", () => {
    const existing = createRunManifest({
      agentType: "coding",
      mode: "build",
      prompt: "run once",
      sessionId: "session-1",
      providerId: "openai",
      modelId: "gpt-4o",
      harnessId: "cloudflare-sandbox",
    });

    const changedMode = createRunManifest({
      agentType: "coding",
      mode: "plan",
      prompt: "same run",
      sessionId: "session-1",
      providerId: "openai",
      modelId: "gpt-4o",
      harnessId: "cloudflare-sandbox",
    });

    expect(() => ensureManifestMatch(existing, changedMode)).toThrow(
      RunManifestMismatchError,
    );
  });

  it("rejects active-run manifest drift when execution backend or harness mode changes", () => {
    const existing = createRunManifest({
      agentType: "coding",
      prompt: "run once",
      sessionId: "session-1",
      providerId: "openai",
      modelId: "gpt-4o",
      harnessId: "cloudflare-sandbox",
      executionBackend: "cloudflare_sandbox",
      harnessMode: "platform_owned",
    });

    const changedExecutionBackend = createRunManifest({
      agentType: "coding",
      prompt: "same run",
      sessionId: "session-1",
      providerId: "openai",
      modelId: "gpt-4o",
      harnessId: "cloudflare-sandbox",
      executionBackend: "e2b",
      harnessMode: "platform_owned",
    });

    const changedHarnessMode = createRunManifest({
      agentType: "coding",
      prompt: "same run",
      sessionId: "session-1",
      providerId: "openai",
      modelId: "gpt-4o",
      harnessId: "cloudflare-sandbox",
      executionBackend: "cloudflare_sandbox",
      harnessMode: "delegated",
      metadata: {
        internal: { allowDelegatedHarnessMode: true },
      },
    });

    expect(() =>
      ensureManifestMatch(existing, changedExecutionBackend),
    ).toThrow(RunManifestMismatchError);
    expect(() => ensureManifestMatch(existing, changedHarnessMode)).toThrow(
      RunManifestMismatchError,
    );
  });

  it("keeps manifest fields stable across prompt variations and matrix", () => {
    const prompts = [
      "hey",
      "check README.md",
      "what can you do?",
      "fix this",
    ] as const;

    for (const providerId of PROVIDERS) {
      for (const harnessId of HARNESSES) {
        for (const prompt of prompts) {
          const manifest = createRunManifest({
            agentType: "coding",
            prompt,
            sessionId: "session-1",
            providerId,
            modelId: `${providerId}-model`,
            harnessId,
          });
          expect(manifest.providerId).toBe(providerId);
          expect(manifest.harness).toBe(harnessId);
          expect(manifest.orchestratorBackend).toBe("execution-engine-v1");
          expect(manifest.executionBackend).toBe("cloudflare_sandbox");
        }
      }
    }
  });
});
