import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ManageModelsDialog } from "./ManageModelsDialog";
import type { ProviderRegistryEntry } from "@repo/shared-types";
import type { ProviderModelOption } from "../../services/api/providerClient";

describe("ManageModelsDialog", () => {
  const catalog: ProviderRegistryEntry[] = [
    {
      providerId: "openai",
      displayName: "OpenAI",
      authModes: ["api_key"],
      capabilities: {
        streaming: true,
        tools: true,
        jsonMode: true,
        structuredOutputs: true,
      },
      modelSource: "static",
      defaultModelId: "gpt-4",
    },
  ];

  const providerModels: Record<string, ProviderModelOption[]> = {
    openai: [{ id: "gpt-4", name: "GPT-4", provider: "openai" }],
  };

  const visibleModelIds: Record<string, Set<string>> = {
    openai: new Set(["gpt-4"]),
  };

  it("shows loading state when models are being fetched", () => {
    render(
      <ManageModelsDialog
        isOpen={true}
        onClose={vi.fn()}
        catalog={catalog}
        providerModels={providerModels}
        visibleModelIds={visibleModelIds}
        onToggleModelVisibility={vi.fn()}
        isLoading={true}
      />
    );

    expect(screen.getByText(/loading models/i)).toBeInTheDocument();
  });

  it("shows empty state when there are no provider models", () => {
    render(
      <ManageModelsDialog
        isOpen={true}
        onClose={vi.fn()}
        catalog={catalog}
        providerModels={{}}
        visibleModelIds={{}}
        onToggleModelVisibility={vi.fn()}
      />
    );

    expect(
      screen.getByText(/no models available yet\. connect a provider/i)
    ).toBeInTheDocument();
  });

  it("focuses search and closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <ManageModelsDialog
        isOpen={true}
        onClose={onClose}
        catalog={catalog}
        providerModels={providerModels}
        visibleModelIds={visibleModelIds}
        onToggleModelVisibility={vi.fn()}
      />
    );

    const searchInput = screen.getByPlaceholderText(/search models or providers/i);
    await waitFor(() => {
      expect(searchInput).toHaveFocus();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
