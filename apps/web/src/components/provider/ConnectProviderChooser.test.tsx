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
      adapterFamily: "openai-compatible",
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
      adapterFamily: "anthropic-native",
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
      adapterFamily: "openai-compatible",
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

  it("renders provider search and list", () => {
    render(<ConnectProviderChooser catalog={mockCatalog} {...mockHandlers} />);

    expect(screen.getByPlaceholderText(/search providers/i)).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("Groq")).toBeInTheDocument();
  });

  it("filters providers by query", () => {
    render(<ConnectProviderChooser catalog={mockCatalog} {...mockHandlers} />);

    const input = screen.getByPlaceholderText(/search providers/i);
    fireEvent.change(input, { target: { value: "openai" } });

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.queryByText("Anthropic")).not.toBeInTheDocument();
  });

  it("shows no matches state", () => {
    render(<ConnectProviderChooser catalog={mockCatalog} {...mockHandlers} />);

    const input = screen.getByPlaceholderText(/search providers/i);
    fireEvent.change(input, { target: { value: "nonexistent" } });

    expect(screen.getByText(/no providers match your search/i)).toBeInTheDocument();
  });

  it("moves to API key step after provider selection", async () => {
    render(<ConnectProviderChooser catalog={mockCatalog} {...mockHandlers} />);

    fireEvent.click(screen.getByText("OpenAI"));

    await waitFor(() => {
      expect(screen.getByText(/connect openai/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/api key/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /back to providers/i })).toBeInTheDocument();
    });
  });

  it("returns to provider list on back", async () => {
    render(<ConnectProviderChooser catalog={mockCatalog} {...mockHandlers} />);

    fireEvent.click(screen.getByText("OpenAI"));
    const backButton = await screen.findByRole("button", {
      name: /back to providers/i,
    });

    fireEvent.click(backButton);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search providers/i)).toBeInTheDocument();
    });
  });

  it("requires API key before submit", async () => {
    render(<ConnectProviderChooser catalog={mockCatalog} {...mockHandlers} />);

    fireEvent.click(screen.getByText("OpenAI"));

    const submitButton = await screen.findByRole("button", { name: /submit/i });
    expect(submitButton).toBeDisabled();
  });

  it("submits provider ID and API key", async () => {
    render(<ConnectProviderChooser catalog={mockCatalog} {...mockHandlers} />);

    fireEvent.click(screen.getByText("OpenAI"));

    const keyInput = await screen.findByPlaceholderText(/api key/i);
    fireEvent.change(keyInput, { target: { value: "sk-test-key" } });

    const submitButton = screen.getByRole("button", { name: /submit/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockHandlers.onConnect).toHaveBeenCalledWith("openai", "sk-test-key");
    });
  });

  it("shows submitting state", async () => {
    const { rerender } = render(
      <ConnectProviderChooser
        catalog={mockCatalog}
        isConnecting={false}
        {...mockHandlers}
      />
    );

    fireEvent.click(screen.getByText("OpenAI"));

    rerender(
      <ConnectProviderChooser
        catalog={mockCatalog}
        isConnecting={true}
        {...mockHandlers}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/submitting/i)).toBeInTheDocument();
    });
  });

  it("shows error state", () => {
    render(
      <ConnectProviderChooser
        catalog={mockCatalog}
        error="Invalid API key format"
        {...mockHandlers}
      />
    );

    expect(screen.getByText(/invalid api key format/i)).toBeInTheDocument();
  });

  it("shows success state", () => {
    render(
      <ConnectProviderChooser
        catalog={mockCatalog}
        success="Provider connected successfully"
        {...mockHandlers}
      />
    );

    expect(screen.getByText(/provider connected successfully/i)).toBeInTheDocument();
  });

  it("shows empty catalog message", () => {
    render(<ConnectProviderChooser catalog={[]} {...mockHandlers} />);

    expect(screen.getByText(/no providers available/i)).toBeInTheDocument();
  });
});
