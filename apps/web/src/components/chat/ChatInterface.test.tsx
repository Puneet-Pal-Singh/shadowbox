import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Message } from "@ai-sdk/react";
import { ChatInterface } from "./ChatInterface.js";

vi.mock("./ChatInputBar.js", () => ({
  ChatInputBar: () => <div data-testid="chat-input-bar" />,
}));

vi.mock("./ChatBranchSelector.js", () => ({
  ChatBranchSelector: () => null,
}));

vi.mock("../provider/ProviderDialog.js", () => ({
  ProviderDialog: () => null,
}));

vi.mock("../../hooks/useRunSummary.js", () => ({
  useRunSummary: vi.fn(),
}));

vi.mock("../../hooks/useRunEvents.js", () => ({
  useRunEvents: vi.fn(() => ({ events: [] })),
}));

vi.mock("../../hooks/useProviderStore.js", () => ({
  useProviderStore: vi.fn(() => ({ providerModels: {} })),
}));

import { useRunSummary } from "../../hooks/useRunSummary.js";

describe("ChatInterface", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    vi.mocked(useRunSummary).mockReturnValue({
      summary: {
        runId: "run-1",
        status: "COMPLETED",
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        planArtifact: {
          id: "run-1:plan",
          createdAt: "2026-03-24T10:00:00.000Z",
          summary: "Inspect the repository and then execute the build flow.",
          estimatedSteps: 2,
          tasks: [],
          handoff: {
            targetMode: "build",
            summary: "Move to build with the approved handoff prompt.",
            prompt: "Execute this approved plan in build mode.",
          },
        },
      },
    });
  });

  it("switches to build mode and stages the approved handoff prompt", async () => {
    const handleInputChange = vi.fn();
    const onModeChange = vi.fn();
    const append = vi.fn().mockResolvedValue(undefined);
    const messages: Message[] = [
      {
        id: "assistant-1",
        role: "assistant",
        content: "Plan complete.",
      },
    ];

    render(
      <ChatInterface
        chatProps={{
          messages,
          runId: "run-1",
          input: "",
          handleInputChange,
          handleSubmit: vi.fn(),
          append,
          stop: vi.fn(),
          isLoading: false,
          error: null,
          debugEvents: [],
        }}
        sessionId="session-1"
        mode="plan"
        onModeChange={onModeChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Execute Plan in Build" }),
    );

    expect(onModeChange).toHaveBeenCalledWith("build");
    expect(handleInputChange).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(append).not.toHaveBeenCalled();
    });
  });

  it("hides the build handoff action when build mode cannot be reached", () => {
    render(
      <ChatInterface
        chatProps={{
          messages: [
            {
              id: "assistant-1",
              role: "assistant",
              content: "Plan complete.",
            },
          ],
          runId: "run-1",
          input: "",
          handleInputChange: vi.fn(),
          handleSubmit: vi.fn(),
          append: vi.fn(),
          stop: vi.fn(),
          isLoading: false,
          error: null,
          debugEvents: [],
        }}
        sessionId="session-1"
        mode="plan"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Execute Plan in Build" }),
    ).not.toBeInTheDocument();
  });
});
