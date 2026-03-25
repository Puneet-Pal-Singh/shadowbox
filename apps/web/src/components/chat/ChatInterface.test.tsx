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

vi.mock("../../hooks/useRunActivityFeed.js", () => ({
  useRunActivityFeed: vi.fn(() => ({ feed: null })),
}));

vi.mock("../../hooks/useProviderStore.js", () => ({
  useProviderStore: vi.fn(() => ({ providerModels: {} })),
}));

import { useRunSummary } from "../../hooks/useRunSummary.js";
import { useRunActivityFeed } from "../../hooks/useRunActivityFeed.js";

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
    vi.mocked(useRunActivityFeed).mockReturnValue({
      feed: {
        runId: "run-1",
        sessionId: "session-1",
        status: "COMPLETED",
        items: [
          {
            id: "text-1",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: "text",
            createdAt: "2026-03-24T10:00:00.000Z",
            updatedAt: "2026-03-24T10:00:00.000Z",
            source: "brain",
            role: "user",
            content: "Plan complete.",
          },
          {
            id: "reasoning-1",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: "reasoning",
            createdAt: "2026-03-24T10:00:01.000Z",
            updatedAt: "2026-03-24T10:00:01.000Z",
            source: "brain",
            label: "Preparing handoff",
            summary: "Finalizing the approved plan.",
            phase: "planning",
            status: "completed",
          },
          {
            id: "handoff-1",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: "handoff",
            createdAt: "2026-03-24T10:00:01.000Z",
            updatedAt: "2026-03-24T10:00:01.000Z",
            source: "brain",
            targetMode: "build",
            summary: "Move to build with the approved handoff prompt.",
            prompt: "Execute this approved plan in build mode.",
            status: "ready",
          },
        ],
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

    fireEvent.click(screen.getByRole("button", { name: /worked for 1s/i }));
    expect(screen.getByText("Workflow overview")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Execute Plan in Build" }),
    );

    expect(onModeChange).toHaveBeenCalledWith("build");
    expect(handleInputChange).not.toHaveBeenCalled();
    expect(screen.getByText("Worked for 1s")).toBeInTheDocument();
    expect(screen.queryByText("Activity Feed")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(append).not.toHaveBeenCalled();
    });
  });

  it("renders the workflow overview inside the worked block instead of as a separate panel", () => {
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
        onModeChange={vi.fn()}
      />,
    );

    expect(screen.queryByText("Workflow overview")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /worked for 1s/i }));

    expect(screen.getByText("Workflow overview")).toBeInTheDocument();
    expect(screen.getByText("1 thinking step · 1 handoff")).toBeInTheDocument();
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

  it("keeps each workflow turn attached to its matching user query", () => {
    vi.mocked(useRunSummary).mockReturnValue({
      summary: {
        runId: "run-1",
        status: "COMPLETED",
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        planArtifact: null,
      },
    });
    vi.mocked(useRunActivityFeed).mockReturnValue({
      feed: {
        runId: "run-1",
        sessionId: "session-1",
        status: "COMPLETED",
        items: [
          {
            id: "turn-1-user",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: "text",
            createdAt: "2026-03-24T10:00:00.000Z",
            updatedAt: "2026-03-24T10:00:00.000Z",
            source: "brain",
            role: "user",
            content: "hey",
          },
          {
            id: "turn-1-reasoning",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: "reasoning",
            createdAt: "2026-03-24T10:00:01.000Z",
            updatedAt: "2026-03-24T10:00:01.000Z",
            source: "brain",
            label: "Thinking",
            summary: "Greeting the user.",
            phase: "planning",
            status: "completed",
          },
          {
            id: "turn-1-tool",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: "tool",
            createdAt: "2026-03-24T10:00:02.000Z",
            updatedAt: "2026-03-24T10:00:03.000Z",
            source: "brain",
            toolId: "tool-1",
            toolName: "read_file",
            status: "completed",
            metadata: {
              family: "read",
              count: 1,
              truncated: false,
              loadedPaths: ["README.md"],
              path: "README.md",
            },
          },
          {
            id: "turn-2-user",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-2",
            kind: "text",
            createdAt: "2026-03-24T10:01:00.000Z",
            updatedAt: "2026-03-24T10:01:00.000Z",
            source: "brain",
            role: "user",
            content: "can you read my readme?",
          },
          {
            id: "turn-2-reasoning",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-2",
            kind: "reasoning",
            createdAt: "2026-03-24T10:01:01.000Z",
            updatedAt: "2026-03-24T10:01:01.000Z",
            source: "brain",
            label: "Thinking",
            summary: "Reviewing the repository.",
            phase: "planning",
            status: "completed",
          },
          {
            id: "turn-2-tool-1",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-2",
            kind: "tool",
            createdAt: "2026-03-24T10:01:02.000Z",
            updatedAt: "2026-03-24T10:01:03.000Z",
            source: "brain",
            toolId: "tool-2",
            toolName: "read_file",
            status: "completed",
            metadata: {
              family: "read",
              count: 1,
              truncated: false,
              loadedPaths: ["README.md"],
              path: "README.md",
            },
          },
          {
            id: "turn-2-tool-2",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-2",
            kind: "tool",
            createdAt: "2026-03-24T10:01:04.000Z",
            updatedAt: "2026-03-24T10:01:05.000Z",
            source: "brain",
            toolId: "tool-3",
            toolName: "grep",
            status: "completed",
            metadata: {
              family: "search",
              count: 1,
              truncated: false,
              loadedPaths: ["README.md"],
              path: "README.md",
              pattern: "Shadowbox",
            },
          },
        ],
      },
    });

    const { container } = render(
      <ChatInterface
        chatProps={{
          messages: [
            {
              id: "user-1",
              role: "user",
              content: "hey",
            },
            {
              id: "assistant-1",
              role: "assistant",
              content: "Hello! How can I help you today?",
            },
            {
              id: "user-2",
              role: "user",
              content: "can you read my readme?",
            },
            {
              id: "assistant-2",
              role: "assistant",
              content: "I read the README and summarized it.",
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
        mode="build"
      />,
    );

    const text = container.textContent ?? "";
    expect(text.indexOf("1 tool call · 1 thinking step")).toBeGreaterThan(
      text.indexOf("hey"),
    );
    expect(text.indexOf("1 tool call · 1 thinking step")).toBeLessThan(
      text.indexOf("Hello! How can I help you today?"),
    );
    expect(text.indexOf("2 tool calls · 1 thinking step")).toBeGreaterThan(
      text.indexOf("can you read my readme?"),
    );
    expect(text.indexOf("2 tool calls · 1 thinking step")).toBeLessThan(
      text.indexOf("I read the README and summarized it."),
    );
  });

  it("keeps repeated user prompts attached to distinct workflow turns", () => {
    vi.mocked(useRunSummary).mockReturnValue({
      summary: {
        runId: "run-1",
        status: "COMPLETED",
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        planArtifact: null,
      },
    });
    vi.mocked(useRunActivityFeed).mockReturnValue({
      feed: {
        runId: "run-1",
        sessionId: "session-1",
        status: "COMPLETED",
        items: [
          {
            id: "turn-1-user",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: "text",
            createdAt: "2026-03-24T10:00:00.000Z",
            updatedAt: "2026-03-24T10:00:00.000Z",
            source: "brain",
            role: "user",
            content: "hey",
          },
          {
            id: "turn-1-reasoning",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: "reasoning",
            createdAt: "2026-03-24T10:00:01.000Z",
            updatedAt: "2026-03-24T10:00:01.000Z",
            source: "brain",
            label: "Thinking",
            summary: "Greeting the user.",
            phase: "planning",
            status: "completed",
          },
          {
            id: "turn-1-tool",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-1",
            kind: "tool",
            createdAt: "2026-03-24T10:00:02.000Z",
            updatedAt: "2026-03-24T10:00:03.000Z",
            source: "brain",
            toolId: "tool-1",
            toolName: "read_file",
            status: "completed",
            metadata: {
              family: "read",
              count: 1,
              truncated: false,
              loadedPaths: ["README.md"],
              path: "README.md",
            },
          },
          {
            id: "turn-2-user",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-2",
            kind: "text",
            createdAt: "2026-03-24T10:01:00.000Z",
            updatedAt: "2026-03-24T10:01:00.000Z",
            source: "brain",
            role: "user",
            content: "hey",
          },
          {
            id: "turn-2-reasoning",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-2",
            kind: "reasoning",
            createdAt: "2026-03-24T10:01:01.000Z",
            updatedAt: "2026-03-24T10:01:01.000Z",
            source: "brain",
            label: "Thinking",
            summary: "Reviewing the repository.",
            phase: "planning",
            status: "completed",
          },
          {
            id: "turn-2-tool-1",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-2",
            kind: "tool",
            createdAt: "2026-03-24T10:01:02.000Z",
            updatedAt: "2026-03-24T10:01:03.000Z",
            source: "brain",
            toolId: "tool-2",
            toolName: "read_file",
            status: "completed",
            metadata: {
              family: "read",
              count: 1,
              truncated: false,
              loadedPaths: ["README.md"],
              path: "README.md",
            },
          },
          {
            id: "turn-2-tool-2",
            runId: "run-1",
            sessionId: "session-1",
            turnId: "turn-2",
            kind: "tool",
            createdAt: "2026-03-24T10:01:04.000Z",
            updatedAt: "2026-03-24T10:01:05.000Z",
            source: "brain",
            toolId: "tool-3",
            toolName: "grep",
            status: "completed",
            metadata: {
              family: "search",
              count: 1,
              truncated: false,
              loadedPaths: ["README.md"],
              path: "README.md",
              pattern: "Shadowbox",
            },
          },
        ],
      },
    });

    const { container } = render(
      <ChatInterface
        chatProps={{
          messages: [
            {
              id: "user-1",
              role: "user",
              content: "hey",
            },
            {
              id: "assistant-1",
              role: "assistant",
              content: "Hello! How can I help you today?",
            },
            {
              id: "user-2",
              role: "user",
              content: "hey",
            },
            {
              id: "assistant-2",
              role: "assistant",
              content: "I read the README and summarized it.",
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
        mode="build"
      />,
    );

    const text = container.textContent ?? "";
    const firstHeyIndex = text.indexOf("hey");
    const secondHeyIndex = text.indexOf("hey", firstHeyIndex + 1);

    expect(text.indexOf("1 tool call · 1 thinking step")).toBeGreaterThan(
      firstHeyIndex,
    );
    expect(text.indexOf("1 tool call · 1 thinking step")).toBeLessThan(
      text.indexOf("Hello! How can I help you today?"),
    );
    expect(text.indexOf("2 tool calls · 1 thinking step")).toBeGreaterThan(
      secondHeyIndex,
    );
    expect(text.indexOf("2 tool calls · 1 thinking step")).toBeLessThan(
      text.indexOf("I read the README and summarized it."),
    );
  });
});
