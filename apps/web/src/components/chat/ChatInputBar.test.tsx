import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatInputBar } from "./ChatInputBar.js";
import * as useProviderStoreModule from "../../hooks/useProviderStore.js";
import * as providerHelpersModule from "../../lib/provider-helpers.js";

const IDLE_SWITCH_WARNING =
  "Changing models mid-conversation will degrade performance.";

describe("ChatInputBar", () => {
  type UseProviderStoreResult = ReturnType<
    typeof useProviderStoreModule.useProviderStore
  >;
  let mockStore: UseProviderStoreResult;
  const credentialId = "550e8400-e29b-41d4-a716-446655440000";

  beforeEach(() => {
    mockStore = {
      catalog: [
        {
          providerId: "openai",
          displayName: "OpenAI",
          website: "https://openai.com",
          authType: "api_key",
          configFields: [],
        },
      ],
      credentials: [
        {
          credentialId,
          providerId: "openai",
          displayName: "OpenAI Key",
          status: "connected",
          addedAt: new Date().toISOString(),
        },
      ],
      preferences: null,
      providerModels: {
        openai: [{ id: "gpt-4o", name: "GPT-4o", provider: "openai" }],
      },
      providerModelsMetadata: {},
      providerModelsPage: {},
      visibleModelIds: { openai: new Set(["gpt-4o"]) },
      selectedProviderId: "openai",
      selectedCredentialId: credentialId,
      selectedModelId: "gpt-4o",
      selectedModelView: "popular",
      lastResolvedConfig: {
        providerId: "openai",
        credentialId,
        modelId: "gpt-4o",
        resolvedAt: "workspace_preference",
        resolvedAtTime: new Date().toISOString(),
      },
      status: "ready",
      error: null,
      isValidating: false,
      loadingModelsForProviderId: null,
      refreshingModelsForProviderId: null,
      bootstrap: vi.fn(async () => undefined),
      connectCredential: vi.fn(async () => undefined),
      disconnectCredential: vi.fn(async () => undefined),
      validateCredential: vi.fn(async () => undefined),
      updatePreferences: vi.fn(async () => undefined),
      loadProviderModels: vi.fn(async () => []),
      loadMoreProviderModels: vi.fn(async () => []),
      refreshProviderModels: vi.fn(async () => undefined),
      setModelView: vi.fn(async () => undefined),
      setSelection: vi.fn(),
      applySessionSelection: vi.fn(async () => ({
        providerId: "openai",
        credentialId,
        modelId: "gpt-4o",
        resolvedAt: "workspace_preference" as const,
        resolvedAtTime: new Date().toISOString(),
      })),
      resolveForChat: vi.fn(async () => ({
        providerId: "openai",
        credentialId,
        modelId: "gpt-4o",
        resolvedAt: "workspace_preference" as const,
        resolvedAtTime: new Date().toISOString(),
      })),
      toggleModelVisibility: vi.fn(),
      setProviderVisibleModels: vi.fn(),
      clearError: vi.fn(),
      reset: vi.fn(),
    };

    vi.spyOn(
      useProviderStoreModule,
      "useProviderStore",
    ).mockReturnValue(mockStore);

    vi.spyOn(
      providerHelpersModule,
      "findCredentialByProviderId",
    ).mockReturnValue({
      credentialId,
      providerId: "openai",
      displayName: "OpenAI Key",
      status: "connected",
      addedAt: new Date().toISOString(),
    });
  });

  describe("idle switch warning", () => {
    it("does not show warning on initial render", () => {
      render(
        <ChatInputBar
          input=""
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          sessionId="session-1"
          hasMessages
        />,
      );

      expect(screen.queryByText(IDLE_SWITCH_WARNING)).toBeNull();
    });

    it("shows warning with exact copy after idle model switch when thread has messages", async () => {
      render(
        <ChatInputBar
          input=""
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          sessionId="session-1"
          hasMessages
        />,
      );

      const trigger = screen.getByLabelText("Open model picker");
      fireEvent.click(trigger);

      const modelOption = await screen.findByText("GPT-4o");
      fireEvent.click(modelOption);

      await waitFor(() => {
        expect(screen.getByText(IDLE_SWITCH_WARNING)).toBeTruthy();
      });
    });

    it("does not show warning when thread has no messages", async () => {
      render(
        <ChatInputBar
          input=""
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          sessionId="session-1"
          hasMessages={false}
        />,
      );

      const trigger = screen.getByLabelText("Open model picker");
      fireEvent.click(trigger);

      const modelOption = await screen.findByText("GPT-4o");
      fireEvent.click(modelOption);

      await waitFor(() => {
        expect(mockStore.applySessionSelection).toHaveBeenCalled();
      });

      expect(screen.queryByText(IDLE_SWITCH_WARNING)).toBeNull();
    });

    it("does not show warning during active run", () => {
      render(
        <ChatInputBar
          input=""
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          sessionId="session-1"
          hasMessages
          isLoading
        />,
      );

      expect(screen.queryByText(IDLE_SWITCH_WARNING)).toBeNull();
    });
  });
});
