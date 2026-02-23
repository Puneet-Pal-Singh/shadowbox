/**
 * ProviderDialog Component Tests
 *
 * Tests for tabs, credential management, and preferences.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProviderDialog } from "./ProviderDialog.js";
import * as useByokStoreModule from "../../hooks/useByokStore.js";

describe("ProviderDialog", () => {
  let mockStore: any;

  beforeEach(() => {
    mockStore = {
      catalog: [
        {
          providerId: "openai",
          displayName: "OpenAI",
          authModes: ["api_key"],
        },
      ],
      credentials: [
        {
          id: "cred-1",
          providerId: "openai",
          status: "connected",
          fingerprint: "abc123xyz",
        },
      ],
      preferences: {
        fallbackMode: "strict",
      },
      selectedProviderId: "openai",
      selectedCredentialId: "cred-1",
      selectedModelId: "gpt-4",
      status: "ready",
      error: null,
      isValidating: false,
      lastResolvedConfig: {
        providerId: "openai",
        credentialId: "cred-1",
        modelId: "gpt-4",
        resolvedAt: "workspace_preference",
        resolvedAtTime: new Date().toISOString(),
        fallbackUsed: false,
      },
      bootstrap: vi.fn(),
      connectCredential: vi.fn(),
      disconnectCredential: vi.fn(),
      validateCredential: vi.fn(),
      updatePreferences: vi.fn(),
      setSelection: vi.fn(),
      resolveForChat: vi.fn(),
      clearError: vi.fn(),
    };

    vi.spyOn(useByokStoreModule, "useByokStore").mockReturnValue(mockStore);
  });

  describe("rendering", () => {
    it("renders dialog when isOpen is true", () => {
      render(<ProviderDialog isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText("Provider & Model Settings")).toBeInTheDocument();
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("does not render dialog when isOpen is false", () => {
      const { container } = render(
        <ProviderDialog isOpen={false} onClose={vi.fn()} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe("Connected tab", () => {
    it("displays connected credentials", () => {
      render(<ProviderDialog isOpen={true} onClose={vi.fn()} />);

      expect(screen.getByText("openai (default)")).toBeInTheDocument();
      expect(screen.getByText("Provider: openai")).toBeInTheDocument();
    });

    it("shows empty state when no credentials", () => {
      mockStore.credentials = [];
      render(<ProviderDialog isOpen={true} onClose={vi.fn()} />);

      expect(
        screen.getByText("No credentials connected")
      ).toBeInTheDocument();
    });

    it("calls disconnectCredential when remove clicked", async () => {
      render(<ProviderDialog isOpen={true} onClose={vi.fn()} />);

      const removeButton = screen.getByText("Remove");
      fireEvent.click(removeButton);

      await waitFor(() => {
        expect(mockStore.disconnectCredential).toHaveBeenCalledWith("cred-1");
      });
    });

    it("calls validateCredential when test clicked", async () => {
      render(<ProviderDialog isOpen={true} onClose={vi.fn()} />);

      const testButton = screen.getByText("Test");
      fireEvent.click(testButton);

      await waitFor(() => {
        expect(mockStore.validateCredential).toHaveBeenCalledWith(
          "cred-1",
          "format"
        );
      });
    });
  });

  describe("Available tab", () => {
    it("shows form to add new credential", () => {
      render(<ProviderDialog isOpen={true} onClose={vi.fn()} />);

      const availableTab = screen.getByText("Available");
      fireEvent.click(availableTab);

      expect(screen.getByText("Provider")).toBeInTheDocument();
      expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    it("calls connectCredential with form data", async () => {
      render(<ProviderDialog isOpen={true} onClose={vi.fn()} />);

      const availableTab = screen.getByText("Available");
      fireEvent.click(availableTab);

      const providerSelect = screen.getByDisplayValue(
        "Select a provider..."
      ) as HTMLSelectElement;
      const secretInput = screen.getByPlaceholderText(
        "sk-..."
      ) as HTMLInputElement;

      fireEvent.change(providerSelect, { target: { value: "openai" } });
      fireEvent.change(secretInput, { target: { value: "sk-test123" } });

      const connectButton = screen.getByText("Connect Provider");
      fireEvent.click(connectButton);

      await waitFor(() => {
        expect(mockStore.connectCredential).toHaveBeenCalledWith({
          providerId: "openai",
          secret: "sk-test123",
          label: undefined,
        });
      });
    });
  });

  describe("Preferences tab", () => {
    it("shows fallback mode options", () => {
      render(<ProviderDialog isOpen={true} onClose={vi.fn()} />);

      const prefTab = screen.getByText("Preferences");
      fireEvent.click(prefTab);

      expect(screen.getByText(/Strict/)).toBeInTheDocument();
      expect(screen.getByText(/Allow Fallback/)).toBeInTheDocument();
    });

    it("calls updatePreferences on fallback mode change", async () => {
      render(<ProviderDialog isOpen={true} onClose={vi.fn()} />);

      const prefTab = screen.getByText("Preferences");
      fireEvent.click(prefTab);

      const allowFallbackLabel = screen.getByLabelText(/Allow Fallback/);
      fireEvent.click(allowFallbackLabel);

      await waitFor(() => {
        expect(mockStore.updatePreferences).toHaveBeenCalledWith({
          fallbackMode: "allow_fallback",
        });
      });
    });
  });

  describe("Session tab", () => {
    it("shows provider/credential/model selector", () => {
      render(<ProviderDialog isOpen={true} onClose={vi.fn()} mode="composer" />);

      // Session tab should be active in composer mode
      expect(screen.getByText("Active Session")).toBeInTheDocument();
    });
  });

  describe("close button", () => {
    it("calls onClose when close button clicked", () => {
      const onClose = vi.fn();
      render(<ProviderDialog isOpen={true} onClose={onClose} />);

      const closeButton = screen.getByLabelText("Close");
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it("calls onClose when footer close button clicked", () => {
      const onClose = vi.fn();
      render(<ProviderDialog isOpen={true} onClose={onClose} />);

      const footerCloseButtons = screen.getAllByText("Close");
      fireEvent.click(footerCloseButtons[1]);

      expect(onClose).toHaveBeenCalled();
    });
  });
});
