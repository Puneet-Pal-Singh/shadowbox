/**
 * ModelPickerPopover Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModelPickerPopover } from "./ModelPickerPopover";
import { type ProviderRegistryEntry } from "@repo/shared-types";
import { type ProviderModelOption } from "../../services/api/providerClient";

describe("ModelPickerPopover", () => {
  const mockCatalog: ProviderRegistryEntry[] = [
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
    {
      providerId: "anthropic",
      displayName: "Anthropic",
      authModes: ["api_key"],
      capabilities: {
        streaming: true,
        tools: true,
        jsonMode: false,
        structuredOutputs: false,
      },
      modelSource: "static",
      defaultModelId: "claude-3-opus",
    },
  ];

  const mockModels: Record<string, ProviderModelOption[]> = {
    openai: [
      { id: "gpt-4", name: "GPT-4" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
    ],
    anthropic: [
      { id: "claude-3-opus", name: "Claude 3 Opus" },
      { id: "claude-3-sonnet", name: "Claude 3 Sonnet" },
    ],
  };

  const mockHandlers = {
    onSelectModel: vi.fn(async () => {}),
    onConnectProvider: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders trigger button with default label", () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      expect(screen.getByRole("button", { name: /open model picker/i })).toHaveTextContent(
        "Select Model"
      );
    });

    it("renders trigger button with selected model label", () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId="openai"
          selectedModelId="gpt-4"
          {...mockHandlers}
        />
      );

      expect(screen.getByRole("button", { name: /open model picker/i })).toHaveTextContent(
        "OpenAI: GPT-4"
      );
    });

    it("opens popover on button click", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search models/i)).toBeInTheDocument();
      });
    });
  });

  describe("Model Display", () => {
    it("displays all providers and models when popover is open", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      await waitFor(() => {
        expect(screen.getByText("OpenAI")).toBeInTheDocument();
        expect(screen.getByText("Anthropic")).toBeInTheDocument();
        expect(screen.getByText("GPT-4")).toBeInTheDocument();
        expect(screen.getByText("Claude 3 Opus")).toBeInTheDocument();
      });
    });

    it("shows checkmark for selected model", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId="openai"
          selectedModelId="gpt-4"
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      await waitFor(() => {
        const gpt4Button = screen.getByText("GPT-4").closest("button");
        expect(gpt4Button).toHaveClass("bg-blue-900/40");
        expect(gpt4Button?.textContent).toContain("✓");
      });
    });
  });

  describe("Search", () => {
    it("filters models by search query", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      const searchInput = await screen.findByPlaceholderText(/search models/i);
      fireEvent.change(searchInput, { target: { value: "gpt" } });

      await waitFor(() => {
        expect(screen.getByText("GPT-4")).toBeInTheDocument();
        expect(screen.getByText("GPT-4 Turbo")).toBeInTheDocument();
        expect(screen.queryByText("Claude 3 Opus")).not.toBeInTheDocument();
      });
    });

    it("filters by provider name", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      const searchInput = await screen.findByPlaceholderText(/search models/i);
      fireEvent.change(searchInput, { target: { value: "anthropic" } });

      await waitFor(() => {
        expect(screen.getByText("Claude 3 Opus")).toBeInTheDocument();
        expect(screen.queryByText("GPT-4")).not.toBeInTheDocument();
      });
    });

    it("shows empty message when no models match search", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      const searchInput = await screen.findByPlaceholderText(/search models/i);
      fireEvent.change(searchInput, { target: { value: "nonexistent" } });

      await waitFor(() => {
        expect(screen.getByText(/no models match your search/i)).toBeInTheDocument();
      });
    });
  });

  describe("Selection", () => {
    it("calls onSelectModel when model is clicked", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      const gpt4Button = await screen.findByText("GPT-4");
      const modelButton = gpt4Button.closest("button");

      fireEvent.click(modelButton!);

      await waitFor(() => {
        expect(mockHandlers.onSelectModel).toHaveBeenCalledWith("openai", "gpt-4");
      });
    });

    it("closes popover after model selection", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      const gpt4Button = await screen.findByText("GPT-4");
      const modelButton = gpt4Button.closest("button");

      fireEvent.click(modelButton!);

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/search models/i)).not.toBeInTheDocument();
      });
    });

    it("resets search query after selection", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      const searchInput = (await screen.findByPlaceholderText(/search models/i)) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "gpt" } });

      const gpt4Button = await screen.findByText("GPT-4");
      const modelButton = gpt4Button.closest("button");

      fireEvent.click(modelButton!);

      // Wait for async selection flow to close popover first
      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/search models/i)).not.toBeInTheDocument();
      });

      // Reopen and verify search is reset
      fireEvent.click(screen.getByRole("button", { name: /open model picker/i }));
      const newSearchInput = (await screen.findByPlaceholderText(
        /search models/i
      )) as HTMLInputElement;
      expect(newSearchInput.value).toBe("");
    });
  });

  describe("Actions", () => {
    it("calls onConnectProvider when Connect button is clicked", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      const connectButton = await screen.findByRole("button", {
        name: /connect provider/i,
      });
      fireEvent.click(connectButton);

      expect(mockHandlers.onConnectProvider).toHaveBeenCalled();
    });

    it("closes popover when Connect button is clicked", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      const connectButton = await screen.findByRole("button", {
        name: /connect provider/i,
      });
      fireEvent.click(connectButton);

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/search models/i)).not.toBeInTheDocument();
      });
    });

    it("disables manage button (PR-UI3 placeholder)", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      const manageButton = await screen.findByRole("button", { name: /manage/i });
      expect(manageButton).toBeDisabled();
    });
  });

  describe("Outside Click", () => {
    it("closes popover when clicking outside", async () => {
      render(
        <div>
          <ModelPickerPopover
            catalog={mockCatalog}
            providerModels={mockModels}
            selectedProviderId={null}
            selectedModelId={null}
            {...mockHandlers}
          />
          <div data-testid="outside">Outside element</div>
        </div>
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search models/i)).toBeInTheDocument();
      });

      const outside = screen.getByTestId("outside");
      fireEvent.mouseDown(outside);

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/search models/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("Loading State", () => {
    it("disables trigger button when isLoading is true", () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={mockModels}
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
          isLoading={true}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      expect(triggerButton).toBeDisabled();
    });
  });

  describe("Empty State", () => {
    it("shows empty message when no providers are connected", async () => {
      render(
        <ModelPickerPopover
          catalog={mockCatalog}
          providerModels={{}} // No models
          selectedProviderId={null}
          selectedModelId={null}
          {...mockHandlers}
        />
      );

      const triggerButton = screen.getByRole("button", { name: /open model picker/i });
      fireEvent.click(triggerButton);

      await waitFor(() => {
        expect(
          screen.getByText(/no providers connected. click connect below/i)
        ).toBeInTheDocument();
      });
    });
  });
});
