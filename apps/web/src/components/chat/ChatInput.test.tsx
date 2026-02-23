/**
 * ChatInput Component Tests
 *
 * Tests for send gating and provider resolution integration.
 */
// @ts-nocheck - Test mocks intentionally use flexible typing

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatInput } from "./ChatInput.js";
import * as useByokStoreModule from "../../hooks/useByokStore.js";

describe("ChatInput", () => {
  let mockStore: Record<string, unknown>;
  let onSendMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSendMessage = vi.fn().mockResolvedValue(undefined);

    mockStore = {
      catalog: [],
      credentials: [],
      preferences: null,
      selectedProviderId: "openai",
      selectedCredentialId: "cred-1",
      selectedModelId: "gpt-4",
      lastResolvedConfig: {
        providerId: "openai",
        credentialId: "cred-1",
        modelId: "gpt-4",
        resolvedAt: "workspace_preference",
        resolvedAtTime: new Date().toISOString(),
        fallbackUsed: false,
      },
      status: "ready",
      error: null,
      isValidating: false,
      bootstrap: vi.fn().mockResolvedValue(undefined),
      connectCredential: vi.fn(),
      disconnectCredential: vi.fn(),
      validateCredential: vi.fn(),
      updatePreferences: vi.fn(),
      setSelection: vi.fn(),
      resolveForChat: vi.fn().mockResolvedValue(undefined),
      clearError: vi.fn(),
      reset: vi.fn(),
    };

    vi.spyOn(useByokStoreModule, "useByokStore").mockReturnValue(mockStore);
  });

  describe("send gating", () => {
    it("disables send button when status is loading", () => {
      mockStore.status = "loading";
      mockStore.lastResolvedConfig = null;

      render(<ChatInput onSendMessage={onSendMessage} />);

      const sendButton = screen.getByText("Send");
      expect(sendButton).toBeDisabled();
    });

    it("disables send button when status is error", () => {
      mockStore.status = "error";
      mockStore.error = "Failed to load credentials";
      mockStore.lastResolvedConfig = null;

      render(<ChatInput onSendMessage={onSendMessage} />);

      const sendButton = screen.getByText("Send");
      expect(sendButton).toBeDisabled();
    });

    it("allows send when ready and resolved", async () => {
      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(
        /Type your message/
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello" } });

      const sendButton = screen.getByText("Send");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith("Hello");
      });
    });

    it("allows send when ready and resolved", async () => {
      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(
        /Type your message/
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello" } });

      const sendButton = screen.getByText("Send");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith("Hello");
      });
    });
  });

  describe("message handling", () => {
    it("clears message after sending", async () => {
      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(
        /Type your message/
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello" } });

      const sendButton = screen.getByText("Send");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(textarea.value).toBe("");
      });
    });

    it("trims whitespace before sending", async () => {
      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(
        /Type your message/
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "  Hello  \n" } });

      const sendButton = screen.getByText("Send");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith("Hello");
      });
    });

    it("restores message on send error", async () => {
      onSendMessage = vi.fn().mockRejectedValueOnce(new Error("Send failed"));

      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(
        /Type your message/
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello" } });

      const sendButton = screen.getByText("Send");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(textarea.value).toBe("Hello");
      });
    });
  });

  describe("keyboard shortcuts", () => {
    it("sends message on Enter key", async () => {
      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(
        /Type your message/
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello" } });

      fireEvent.keyDown(textarea, { key: "Enter" });

      await waitFor(() => {
        expect(onSendMessage).toHaveBeenCalledWith("Hello");
      });
    });

    it("creates new line on Shift+Enter", () => {
      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(
        /Type your message/
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello" } });

      fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });

      // Should not send
      expect(onSendMessage).not.toHaveBeenCalled();
    });
  });

  describe("UI state", () => {
    it("shows loading state while sending", async () => {
      onSendMessage = vi.fn(() => new Promise(() => {})); // Never resolves

      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(
        /Type your message/
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello" } });

      const sendButton = screen.getByText("Send");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(screen.getByText(/Sending.../)).toBeInTheDocument();
      });
    });

    it("shows resolved config info", () => {
      render(<ChatInput onSendMessage={onSendMessage} />);

      expect(screen.getByText(/Using openai · gpt-4/)).toBeInTheDocument();
    });

    it("bootstraps store on mount", () => {
      mockStore.status = "idle";
      render(<ChatInput onSendMessage={onSendMessage} />);

      expect(mockStore.bootstrap).toHaveBeenCalled();
    });
  });
});
