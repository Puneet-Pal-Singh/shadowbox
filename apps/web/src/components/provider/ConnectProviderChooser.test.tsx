/**
 * ConnectProviderChooser Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConnectProviderChooser } from "./ConnectProviderChooser";
import { type ProviderRegistryEntry } from "@repo/shared-types";

describe("ConnectProviderChooser", () => {
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
      keyFormat: {
        prefix: "sk-",
        description: "OpenAI API key (starts with sk-)",
      },
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
      keyFormat: {
        prefix: "sk-ant-",
        description: "Anthropic API key (starts with sk-ant-)",
      },
    },
    {
      providerId: "groq",
      displayName: "Groq",
      authModes: ["api_key"],
      capabilities: {
        streaming: true,
        tools: false,
        jsonMode: false,
        structuredOutputs: false,
      },
      modelSource: "remote",
    },
  ];

  const mockHandlers = {
    onConnect: vi.fn(async () => {}),
    onErrorClear: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders search input and provider list", () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      expect(screen.getByPlaceholderText(/search by provider/i)).toBeInTheDocument();
      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
      expect(screen.getByText("Groq")).toBeInTheDocument();
    });

    it("shows provider count", () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      expect(screen.getByText(/available providers \(3\)/i)).toBeInTheDocument();
    });

    it("displays initial message when no provider selected", () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      expect(
        screen.getByText(/select a provider above to enter your api key/i)
      ).toBeInTheDocument();
    });
  });

  describe("Provider Selection", () => {
    it("shows API key form when provider is selected", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/e\.g\., sk-/i)
        ).toBeInTheDocument();
      });
    });

    it("displays provider capabilities", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      await waitFor(() => {
        expect(screen.getByText(/streaming, tools, json/i)).toBeInTheDocument();
      });
    });

    it("shows key format hint when available", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const anthropicButton = screen.getByText("Anthropic").closest("button");
      fireEvent.click(anthropicButton!);

      await waitFor(() => {
        expect(
          screen.getByText(/anthropic api key \(starts with sk-ant-\)/i)
        ).toBeInTheDocument();
      });
    });

    it("highlights selected provider", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const groqButton = screen.getByText("Groq").closest("button");
      fireEvent.click(groqButton!);

      await waitFor(() => {
        expect(groqButton).toHaveClass("bg-blue-50");
      });
    });
  });

  describe("Search", () => {
    it("filters providers by display name", () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const searchInput = screen.getByPlaceholderText(/search by provider/i);
      fireEvent.change(searchInput, { target: { value: "openai" } });

      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.queryByText("Anthropic")).not.toBeInTheDocument();
      expect(screen.queryByText("Groq")).not.toBeInTheDocument();
    });

    it("filters providers by provider ID", () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const searchInput = screen.getByPlaceholderText(/search by provider/i);
      fireEvent.change(searchInput, { target: { value: "groq" } });

      expect(screen.getByText("Groq")).toBeInTheDocument();
      expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();
    });

    it("shows no results message when no providers match", () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const searchInput = screen.getByPlaceholderText(/search by provider/i);
      fireEvent.change(searchInput, { target: { value: "nonexistent" } });

      expect(
        screen.getByText(/no providers match your search/i)
      ).toBeInTheDocument();
    });

    it("clears search results when search is cleared", () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const searchInput = screen.getByPlaceholderText(/search by provider/i) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: "openai" } });

      expect(screen.queryByText("Anthropic")).not.toBeInTheDocument();

      fireEvent.change(searchInput, { target: { value: "" } });

      expect(screen.getByText("OpenAI")).toBeInTheDocument();
      expect(screen.getByText("Anthropic")).toBeInTheDocument();
    });
  });

  describe("API Key Form", () => {
    it("requires API key before allowing connect", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      const connectButton = await screen.findByRole("button", {
        name: /connect provider/i,
      });
      expect(connectButton).toBeDisabled();
    });

    it("enables connect button when API key is entered", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      const keyInput = await screen.findByPlaceholderText(/e\.g\., sk-/i);
      fireEvent.change(keyInput, { target: { value: "sk-test-key" } });

      const connectButton = screen.getByRole("button", {
        name: /connect provider/i,
      });
      expect(connectButton).not.toBeDisabled();
    });

    it("calls onConnect with provider ID and secret", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      const keyInput = await screen.findByPlaceholderText(/e\.g\., sk-/i);
      fireEvent.change(keyInput, { target: { value: "sk-test-key" } });

      const connectButton = screen.getByRole("button", {
        name: /connect provider/i,
      });
      fireEvent.click(connectButton);

      await waitFor(() => {
        expect(mockHandlers.onConnect).toHaveBeenCalledWith(
          "openai",
          "sk-test-key",
          undefined
        );
      });
    });

    it("calls onConnect with optional label", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      const keyInput = await screen.findByPlaceholderText(/e\.g\., sk-/i);
      fireEvent.change(keyInput, { target: { value: "sk-test-key" } });

      const labelInput = screen.getByPlaceholderText(/e\.g\., 'personal'/i);
      fireEvent.change(labelInput, { target: { value: "Work" } });

      const connectButton = screen.getByRole("button", {
        name: /connect provider/i,
      });
      fireEvent.click(connectButton);

      await waitFor(() => {
        expect(mockHandlers.onConnect).toHaveBeenCalledWith(
          "openai",
          "sk-test-key",
          "Work"
        );
      });
      });

      it("clears form fields after successful connect", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      const keyInput = (await screen.findByPlaceholderText(
        /e\.g\., sk-/i
      )) as HTMLInputElement;
      fireEvent.change(keyInput, { target: { value: "sk-test-key" } });

      const labelInput = screen.getByPlaceholderText(
        /e\.g\., 'personal'/i
      ) as HTMLInputElement;
      fireEvent.change(labelInput, { target: { value: "Work" } });

      const connectButton = screen.getByRole("button", {
        name: /connect provider/i,
      });
      fireEvent.click(connectButton);

      await waitFor(() => {
        expect(keyInput.value).toBe("");
        expect(labelInput.value).toBe("");
      });
    });
  });

  describe("Error Handling", () => {
    it("displays error message", () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          error="Invalid API key format"
          {...mockHandlers}
        />
      );

      expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();
    });

    it("calls onErrorClear when provider is selected", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          error="Invalid API key"
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      await waitFor(() => {
        expect(mockHandlers.onErrorClear).toHaveBeenCalled();
      });
    });

    it("calls onErrorClear when API key is changed", async () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          error="Invalid API key"
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      const keyInput = await screen.findByPlaceholderText(/e\.g\., sk-/i);
      fireEvent.change(keyInput, { target: { value: "sk-new-key" } });

      await waitFor(() => {
        expect(mockHandlers.onErrorClear).toHaveBeenCalledTimes(2); // Once on select, once on change
      });
    });
  });

  describe("Success State", () => {
    it("displays success message", () => {
      render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          success="Provider connected successfully"
          {...mockHandlers}
        />
      );

      expect(
        screen.getByText(/provider connected successfully/i)
      ).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("disables connect button when connecting", async () => {
      const { rerender } = render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          isConnecting={false}
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      // Now re-render with isConnecting=true to trigger loading state
      rerender(
        <ConnectProviderChooser
          catalog={mockCatalog}
          isConnecting={true}
          {...mockHandlers}
        />
      );

      const connectButton = await screen.findByRole("button", {
        name: /connecting/i,
      });
      expect(connectButton).toBeDisabled();
    });

    it("shows connecting state text", async () => {
      const { rerender } = render(
        <ConnectProviderChooser
          catalog={mockCatalog}
          isConnecting={false}
          {...mockHandlers}
        />
      );

      const openaiButton = screen.getByText("OpenAI").closest("button");
      fireEvent.click(openaiButton!);

      // Now re-render with isConnecting=true to trigger loading state
      rerender(
        <ConnectProviderChooser
          catalog={mockCatalog}
          isConnecting={true}
          {...mockHandlers}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/connecting\.\.\./i)).toBeInTheDocument();
      });
    });
  });

  describe("Empty Catalog", () => {
    it("shows empty message when catalog is empty", () => {
      render(
        <ConnectProviderChooser
          catalog={[]}
          {...mockHandlers}
        />
      );

      expect(
        screen.getByText(/no providers available/i)
      ).toBeInTheDocument();
    });
  });
});
