import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useState } from "react";
import { ChatInputBar } from "./ChatInputBar.js";
import * as useProviderStoreModule from "../../hooks/useProviderStore.js";
import * as providerHelpersModule from "../../lib/provider-helpers.js";
import * as useGitHubTreeModule from "../layout/workspace/useGitHubTree.js";

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
          authModes: ["api_key"],
          adapterFamily: "openai-compatible",
          capabilities: {
            streaming: true,
            tools: true,
            jsonMode: true,
            structuredOutputs: true,
          },
          modelSource: "static",
        },
      ],
      credentials: [
        {
          credentialId,
          userId: "user-1",
          workspaceId: "workspace-1",
          providerId: "openai",
          label: "OpenAI Key",
          keyFingerprint: "openai-key-fingerprint",
          encryptedSecretJson: "{}",
          keyVersion: "1",
          status: "connected",
          lastValidatedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
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

    vi.spyOn(useProviderStoreModule, "useProviderStore").mockReturnValue(
      mockStore,
    );

    vi.spyOn(
      providerHelpersModule,
      "findCredentialByProviderId",
    ).mockReturnValue({
      credentialId,
      userId: "user-1",
      workspaceId: "workspace-1",
      providerId: "openai",
      label: "OpenAI Key",
      keyFingerprint: "openai-key-fingerprint",
      encryptedSecretJson: "{}",
      keyVersion: "1",
      status: "connected",
      lastValidatedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    vi.spyOn(useGitHubTreeModule, "useGitHubTree").mockReturnValue({
      repoTree: [],
      isLoadingTree: false,
      repo: null,
      branch: "main",
      isGitHubLoaded: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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

    it("auto-dismisses warning after 4 seconds", async () => {
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

      await waitFor(
        () => {
          expect(screen.queryByText(IDLE_SWITCH_WARNING)).toBeNull();
        },
        { timeout: 5000 },
      );
    }, 12000);

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

  it("surfaces a build/plan mode toggle and emits changes", () => {
    const onModeChange = vi.fn();

    render(
      <ChatInputBar
        input=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        sessionId="session-1"
        mode="build"
        onModeChange={onModeChange}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Plan" }));

    expect(onModeChange).toHaveBeenCalledWith("plan");
  });

  it("shows plan-mode guidance and lets users switch back to build", () => {
    const onModeChange = vi.fn();

    render(
      <ChatInputBar
        input=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        sessionId="session-1"
        mode="plan"
        onModeChange={onModeChange}
      />,
    );

    expect(
      screen.getByPlaceholderText(
        "Inspect the codebase and outline a safe plan without executing changes",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Plan mode inspects and outlines steps without running normal mutating execution.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Switch to Build" }));

    expect(onModeChange).toHaveBeenCalledWith("build");
  });

  it("shows repo file suggestions for @ mentions and inserts the selected file", async () => {
    vi.spyOn(useGitHubTreeModule, "useGitHubTree").mockReturnValue({
      repoTree: [
        { path: "README.md", type: "blob", sha: "1" },
        {
          path: "apps/web/src/components/chat/ChatInputBar.tsx",
          type: "blob",
          sha: "2",
        },
      ],
      isLoadingTree: false,
      repo: null,
      branch: "main",
      isGitHubLoaded: true,
    });

    function Wrapper() {
      const [value, setValue] = useState("");

      return (
        <ChatInputBar
          input={value}
          onChange={setValue}
          onSubmit={vi.fn()}
          sessionId="session-1"
        />
      );
    }

    render(<Wrapper />);

    const textarea = screen.getByPlaceholderText(
      "Ask Shadowbox anything, @ to add files, / for commands",
    ) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "@rea", selectionStart: 4 } });

    expect(await screen.findByText("README.md")).toBeTruthy();
    expect(screen.getByRole("listbox", { name: "Repository files" })).toBeTruthy();
    expect(textarea).toHaveAttribute("aria-expanded", "true");

    fireEvent.mouseDown(screen.getByText("README.md"));

    await waitFor(() => {
      expect(textarea.value).toBe("@README.md ");
    });
  });

  it("keeps the highlighted option in sync with arrow-key navigation", async () => {
    vi.spyOn(useGitHubTreeModule, "useGitHubTree").mockReturnValue({
      repoTree: [
        { path: "README.md", type: "blob", sha: "1" },
        { path: "docs/guide.md", type: "blob", sha: "2" },
      ],
      isLoadingTree: false,
      repo: null,
      branch: "main",
      isGitHubLoaded: true,
    });

    function Wrapper() {
      const [value, setValue] = useState("");

      return (
        <ChatInputBar
          input={value}
          onChange={setValue}
          onSubmit={vi.fn()}
          sessionId="session-1"
        />
      );
    }

    render(<Wrapper />);

    const textarea = screen.getByPlaceholderText(
      "Ask Shadowbox anything, @ to add files, / for commands",
    ) as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: "@", selectionStart: 1 } });
    await screen.findAllByRole("option");
    fireEvent.keyDown(textarea, { key: "ArrowDown" });

    const options = screen.getAllByRole("option");
    const highlightedOption = options[1];

    expect(highlightedOption?.getAttribute("aria-selected")).toBe("true");
    expect(textarea.getAttribute("aria-activedescendant")).toBe(
      highlightedOption?.id,
    );
  });

  it("adds a separating space before inserting an @ trigger into existing text", async () => {
    function Wrapper() {
      const [value, setValue] = useState("add logging to");

      return (
        <ChatInputBar
          input={value}
          onChange={setValue}
          onSubmit={vi.fn()}
          sessionId="session-1"
        />
      );
    }

    render(<Wrapper />);

    const textarea = screen.getByPlaceholderText(
      "Ask Shadowbox anything, @ to add files, / for commands",
    ) as HTMLTextAreaElement;

    await act(async () => {
      textarea.focus();
      textarea.setSelectionRange(14, 14);
      fireEvent.click(screen.getByTitle("Add files"));
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    await waitFor(() => {
      expect(textarea.value).toBe("add logging to @");
    });
  });

  it("keeps unfinished attachment and voice controls hidden", () => {
    render(
      <ChatInputBar
        input=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        sessionId="session-1"
      />,
    );

    expect(screen.queryByTitle("Attach file")).toBeNull();
    expect(screen.queryByTitle("Voice input")).toBeNull();
  });
});
