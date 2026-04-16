import { describe, expect, it } from "vitest";
import type { ProviderRegistryEntry } from "@repo/shared-types";
import {
  isProviderModelBootstrapLoading,
  isProviderVisibleModelHydrationPending,
} from "./provider-model-bootstrap-loading";

describe("isProviderModelBootstrapLoading", () => {
  const catalog: ProviderRegistryEntry[] = [
    {
      providerId: "axis",
      displayName: "Axis",
      authModes: ["platform_managed"],
      adapterFamily: "openai-compatible",
      capabilities: {
        streaming: true,
        tools: true,
        jsonMode: true,
        structuredOutputs: true,
      },
      modelSource: "remote",
    },
    {
      providerId: "openrouter",
      displayName: "OpenRouter",
      authModes: ["api_key"],
      adapterFamily: "openai-compatible",
      capabilities: {
        streaming: true,
        tools: true,
        jsonMode: true,
        structuredOutputs: true,
      },
      modelSource: "remote",
    },
  ];

  it("returns true while provider bootstrap status is loading", () => {
    expect(
      isProviderModelBootstrapLoading({
        status: "loading",
        catalog: [...catalog],
        credentials: [],
        providerModels: {},
      }),
    ).toBe(true);
  });

  it("returns true when ready but preload provider models are still missing", () => {
    expect(
      isProviderModelBootstrapLoading({
        status: "ready",
        catalog: [...catalog],
        credentials: [
          {
            credentialId: "cred-1",
            userId: "user-1",
            workspaceId: "workspace-1",
            providerId: "openrouter",
            label: "OpenRouter",
            keyFingerprint: "fingerprint",
            encryptedSecretJson: "{}",
            keyVersion: "1",
            status: "connected",
            lastValidatedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
        providerModels: {
          axis: [{ id: "axis/default", name: "Axis Default", provider: "axis" }],
        },
      }),
    ).toBe(true);
  });

  it("returns false when preload providers are all hydrated", () => {
    expect(
      isProviderModelBootstrapLoading({
        status: "ready",
        catalog: [...catalog],
        credentials: [
          {
            credentialId: "cred-1",
            userId: "user-1",
            workspaceId: "workspace-1",
            providerId: "openrouter",
            label: "OpenRouter",
            keyFingerprint: "fingerprint",
            encryptedSecretJson: "{}",
            keyVersion: "1",
            status: "connected",
            lastValidatedAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
        providerModels: {
          axis: [{ id: "axis/default", name: "Axis Default", provider: "axis" }],
          openrouter: [
            { id: "openrouter/auto", name: "OpenRouter Auto", provider: "openrouter" },
          ],
        },
      }),
    ).toBe(false);
  });
});

describe("isProviderVisibleModelHydrationPending", () => {
  it("returns true when selected visible models are missing from picker models", () => {
    expect(
      isProviderVisibleModelHydrationPending({
        selectedProviderId: "openrouter",
        providerModels: {
          openrouter: [
            { id: "model-a", name: "Model A", provider: "openrouter" },
            { id: "model-b", name: "Model B", provider: "openrouter" },
          ],
        },
        visibleModelIds: {
          openrouter: new Set(["model-a", "model-b", "model-c"]),
        },
        manageProviderModels: {},
      }),
    ).toBe(true);
  });

  it("returns false once manage models have hydrated for the selected provider", () => {
    expect(
      isProviderVisibleModelHydrationPending({
        selectedProviderId: "openrouter",
        providerModels: {
          openrouter: [
            { id: "model-a", name: "Model A", provider: "openrouter" },
            { id: "model-b", name: "Model B", provider: "openrouter" },
          ],
        },
        visibleModelIds: {
          openrouter: new Set(["model-a", "model-b", "model-c"]),
        },
        manageProviderModels: {
          openrouter: [
            { id: "model-a", name: "Model A", provider: "openrouter" },
            { id: "model-b", name: "Model B", provider: "openrouter" },
            { id: "model-c", name: "Model C", provider: "openrouter" },
          ],
        },
      }),
    ).toBe(false);
  });
});
