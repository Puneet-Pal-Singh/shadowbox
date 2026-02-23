/**
 * ChatInput Component Tests
 *
 * Tests for send gating and provider resolution integration.
 */

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
      status: "ready",
      error: null,
      lastResolvedConfig: {
        providerId: "openai",
        credentialId: "cred-1",
        modelId: "gpt-4",
        resolvedAt: "workspace_preference",
        resolvedAtTime: new Date().toISOString(),
        fallbackUsed: false,
      },
      bootstrap: vi.fn(),
      resolveForChat: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(useByokStoreModule, "useByokStore").mockReturnValue(mockStore);
  });

  describe("send gating", () => {
    it("blocks send when status is loading", async () => {
      mockStore.status = "loading";
      mockStore.lastResolvedConfig = null;

      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(/Waiting for provider/);
      fireEvent.change(textarea, { target: { value: "Hello" } });

      const sendButton = screen.getByText("Send");
      fireEvent.click(sendButton);

      expect(onSendMessage).not.toHaveBeenCalled();
      expect(
        screen.getByText(/Loading provider configuration/)
      ).toBeInTheDocument();
    });

    it("blocks send when status is error", async () => {
      mockStore.status = "error";
      mockStore.error = "Failed to load credentials";
      mockStore.lastResolvedConfig = null;

      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(/Waiting for provider/);
      fireEvent.change(textarea, { target: { value: "Hello" } });

      const sendButton = screen.getByText("Send");
      fireEvent.click(sendButton);

      expect(onSendMessage).not.toHaveBeenCalled();
      expect(
        screen.getByText(/Failed to load credentials/)
      ).toBeInTheDocument();
    });

    it("resolves config if not already resolved", async () => {
      mockStore.lastResolvedConfig = null;
      mockStore.resolveForChat = vi.fn().mockResolvedValue(undefined);

      // Mock store update after resolve
      render(<ChatInput onSendMessage={onSendMessage} />);

      const textarea = screen.getByPlaceholderText(
        /Type your message/
      ) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: "Hello" } });

      const sendButton = screen.getByText("Send");
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockStore.resolveForChat).toHaveBeenCalled();
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
