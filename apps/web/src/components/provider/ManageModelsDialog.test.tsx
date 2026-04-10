import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  BYOKCredential as ProviderCredential,
  type ProviderRegistryEntry,
} from "@repo/shared-types";
import { ManageModelsDialog } from "./ManageModelsDialog.js";

describe("ManageModelsDialog", () => {
  const catalog: ProviderRegistryEntry[] = [
    {
      providerId: "google",
      displayName: "Google AI (Gemini)",
      authModes: ["api_key"],
      adapterFamily: "google-native",
      capabilities: {
        streaming: true,
        tools: true,
        jsonMode: false,
        structuredOutputs: true,
      },
      modelSource: "remote",
    },
  ];

  const providerModels = {
    google: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "google" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "google" },
    ],
  };

  const credentials: ProviderCredential[] = [
    {
      credentialId: "550e8400-e29b-41d4-a716-446655440000",
      userId: "user-1",
      workspaceId: "ws-1",
      providerId: "google",
      label: "Gemini",
      keyFingerprint: "abc123",
      encryptedSecretJson: "{}",
      keyVersion: "1",
      status: "connected",
      lastValidatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    },
  ];

  it("hides all models when turning a visible provider off", () => {
    const onToggleModelVisibility = vi.fn();
    const onSetProviderVisibleModels = vi.fn();

    render(
      <ManageModelsDialog
        isOpen={true}
        onClose={vi.fn()}
        catalog={catalog}
        credentials={credentials}
        providerModels={providerModels}
        visibleModelIds={{ google: new Set(["gemini-2.5-pro"]) }}
        loadingProviderModelIds={{}}
        onToggleModelVisibility={onToggleModelVisibility}
        onSetProviderVisibleModels={onSetProviderVisibleModels}
      />,
    );

    const providerToggle = screen.getByRole("switch", {
      name: /google ai \(gemini\) provider visibility/i,
    });

    fireEvent.click(providerToggle);
    expect(onSetProviderVisibleModels).toHaveBeenCalledWith("google", []);
  });

  it("restores all provider models when re-enabling a hidden provider", () => {
    const onSetProviderVisibleModels = vi.fn();

    render(
      <ManageModelsDialog
        isOpen={true}
        onClose={vi.fn()}
        catalog={catalog}
        credentials={credentials}
        providerModels={providerModels}
        visibleModelIds={{ google: new Set() }}
        loadingProviderModelIds={{}}
        onToggleModelVisibility={vi.fn()}
        onSetProviderVisibleModels={onSetProviderVisibleModels}
      />,
    );

    fireEvent.click(
      screen.getByRole("switch", {
        name: /google ai \(gemini\) provider visibility/i,
      }),
    );

    expect(onSetProviderVisibleModels).toHaveBeenCalledWith("google", [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
    ]);
  });

  it("keeps connected provider rows visible while models are still loading", () => {
    render(
      <ManageModelsDialog
        isOpen={true}
        onClose={vi.fn()}
        catalog={catalog}
        credentials={credentials}
        providerModels={{}}
        visibleModelIds={{}}
        loadingProviderModelIds={{ google: true }}
        onToggleModelVisibility={vi.fn()}
        onSetProviderVisibleModels={vi.fn()}
      />,
    );

    expect(screen.getByText("Google AI (Gemini)")).toBeInTheDocument();
    expect(screen.getByText(/models loading/i)).toBeInTheDocument();
  });
});
