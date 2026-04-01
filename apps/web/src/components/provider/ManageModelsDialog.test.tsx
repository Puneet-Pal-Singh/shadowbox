import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ProviderRegistryEntry } from "@repo/shared-types";
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

  it("hides all models when turning a visible provider off", () => {
    const onToggleModelVisibility = vi.fn();
    const onSetProviderVisibleModels = vi.fn();

    render(
      <ManageModelsDialog
        isOpen={true}
        onClose={vi.fn()}
        catalog={catalog}
        providerModels={providerModels}
        visibleModelIds={{ google: new Set(["gemini-2.5-pro"]) }}
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
        providerModels={providerModels}
        visibleModelIds={{ google: new Set() }}
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
});
