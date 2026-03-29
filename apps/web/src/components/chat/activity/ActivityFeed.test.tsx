import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_PART_KINDS,
  TOOL_ACTIVITY_FAMILIES,
  type ActivityFeedSnapshot,
} from "@repo/shared-types";
import { ActivityFeed } from "./ActivityFeed.js";

describe("ActivityFeed", () => {
  it("renders collapsed turn summaries and expands grouped exploration rows", () => {
    const onUsePlanInBuild = vi.fn();
    render(
      <ActivityFeed
        feed={createFeedSnapshot()}
        isLoading={false}
        onUsePlanInBuild={onUsePlanInBuild}
      />,
    );

    expect(
      screen.getByRole("button", { name: /worked for 3s/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /worked for 3s/i }));
    expect(screen.getByText("Gathered context")).toBeInTheDocument();
    expect(screen.getByText("Build Handoff")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Execute Plan in Build" }),
    );
    expect(onUsePlanInBuild).toHaveBeenCalledTimes(1);
  });

  it("renders active turns as an open transcript instead of a worked summary", () => {
    render(
      <ActivityFeed
        feed={{
          ...createFeedSnapshot(),
          status: "RUNNING",
          items: [
            ...createFeedSnapshot().items,
            {
              id: "reasoning-1",
              runId: "run-1",
              sessionId: "session-1",
              turnId: "turn-1",
              kind: ACTIVITY_PART_KINDS.REASONING,
              createdAt: "2026-03-24T10:00:03.500Z",
              updatedAt: "2026-03-24T10:00:03.500Z",
              source: "brain",
              label: "Analyzing repository",
              summary: "Inspecting the repository before the next tool call.",
              phase: "planning",
              status: "active",
            },
          ],
        }}
        isLoading={true}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /worked for/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Thinking")).toBeInTheDocument();
    expect(
      screen.getByText("Inspecting the repository before the next tool call."),
    ).toBeInTheDocument();
  });

  it("resets expansion state when the feed switches to a new run", () => {
    const { rerender } = render(
      <ActivityFeed feed={createFeedSnapshot()} isLoading={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /worked for 3s/i }));
    expect(screen.getByText("Gathered context")).toBeInTheDocument();

    rerender(
      <ActivityFeed
        feed={{
          ...createFeedSnapshot(),
          runId: "run-2",
          items: createFeedSnapshot().items.map((item) => ({
            ...item,
            runId: "run-2",
          })),
        }}
        isLoading={false}
      />,
    );

    expect(screen.queryByText("Explore")).not.toBeInTheDocument();
  });

  it("renders grouped child rows without nested show-hide controls", () => {
    render(<ActivityFeed feed={createFeedSnapshot()} isLoading={false} />);

    fireEvent.click(screen.getByRole("button", { name: /worked for 3s/i }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /Gathered context 2 low-noise context actions/i,
      }),
    );

    expect(screen.getByText("Read README.md")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Read README.md" }),
    ).not.toBeInTheDocument();
  });

  it("renders git status rows as command-style transcript details", () => {
    render(
      <ActivityFeed
        feed={{
          runId: "run-git",
          sessionId: "session-git",
          status: "COMPLETED",
          items: [
            {
              id: "text-1",
              runId: "run-git",
              sessionId: "session-git",
              turnId: "turn-1",
              kind: ACTIVITY_PART_KINDS.TEXT,
              createdAt: "2026-03-24T10:00:00.000Z",
              updatedAt: "2026-03-24T10:00:00.000Z",
              source: "brain",
              role: "user",
              content: "check my git info",
            },
            {
              id: "tool-1",
              runId: "run-git",
              sessionId: "session-git",
              turnId: "turn-1",
              kind: ACTIVITY_PART_KINDS.TOOL,
              createdAt: "2026-03-24T10:00:01.000Z",
              updatedAt: "2026-03-24T10:00:02.000Z",
              source: "brain",
              toolId: "tool-1",
              toolName: "git_status",
              status: "completed",
              metadata: {
                family: TOOL_ACTIVITY_FAMILIES.GIT,
                preview:
                  '{"files":[],"ahead":0,"behind":0,"branch":"main","hasStaged":false,"hasUnstaged":false,"gitAvailable":true}',
              },
            },
          ],
        }}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /worked for \d+s/i }));
    expect(
      screen.getByRole("button", { name: /git status on main/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/\$ git status/)).toBeInTheDocument();
    expect(screen.getByText(/working tree clean\./i)).toBeInTheDocument();
  });

  it("renders recoverable assistant updates from activity metadata", () => {
    render(
      <ActivityFeed
        feed={{
          runId: "run-timeout",
          sessionId: "session-timeout",
          status: "COMPLETED",
          items: [
            {
              id: "text-1",
              runId: "run-timeout",
              sessionId: "session-timeout",
              turnId: "turn-1",
              kind: ACTIVITY_PART_KINDS.TEXT,
              createdAt: "2026-03-24T10:00:00.000Z",
              updatedAt: "2026-03-24T10:00:00.000Z",
              source: "brain",
              role: "user",
              content: "update the footer",
            },
            {
              id: "text-2",
              runId: "run-timeout",
              sessionId: "session-timeout",
              turnId: "turn-1",
              kind: ACTIVITY_PART_KINDS.TEXT,
              createdAt: "2026-03-24T10:00:01.000Z",
              updatedAt: "2026-03-24T10:00:01.000Z",
              source: "brain",
              role: "assistant",
              content:
                "The model timed out before choosing the next action.\nNo file was changed before the timeout.",
              metadata: {
                code: "TASK_EXECUTION_TIMEOUT",
                retryable: true,
                resumeHint:
                  "Retry the task or switch to a faster or more reliable model.",
                resumeActions: ["retry", "switch_model"],
              },
            },
          ],
        }}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /worked for \d+s/i }));
    expect(screen.getByText("Recoverable timeout")).toBeInTheDocument();
    expect(
      screen.getByText(/Retry the task or switch to a faster or more reliable model\./i),
    ).toBeInTheDocument();
  });
});

function createFeedSnapshot(): ActivityFeedSnapshot {
  return {
    runId: "run-1",
    sessionId: "session-1",
    status: "COMPLETED",
    items: [
      {
        id: "text-1",
        runId: "run-1",
        sessionId: "session-1",
        turnId: "turn-1",
        kind: ACTIVITY_PART_KINDS.TEXT,
        createdAt: "2026-03-24T10:00:00.000Z",
        updatedAt: "2026-03-24T10:00:00.000Z",
        source: "brain",
        role: "user",
        content: "Inspect the project.",
      },
      {
        id: "tool-1",
        runId: "run-1",
        sessionId: "session-1",
        turnId: "turn-1",
        kind: ACTIVITY_PART_KINDS.TOOL,
        createdAt: "2026-03-24T10:00:01.000Z",
        updatedAt: "2026-03-24T10:00:01.000Z",
        source: "brain",
        toolId: "tool-1",
        toolName: "list_files",
        status: "completed",
        metadata: {
          family: TOOL_ACTIVITY_FAMILIES.READ,
          count: 3,
          truncated: false,
          preview: "src\nREADME.md",
          loadedPaths: ["."],
          path: ".",
        },
      },
      {
        id: "tool-2",
        runId: "run-1",
        sessionId: "session-1",
        turnId: "turn-1",
        kind: ACTIVITY_PART_KINDS.TOOL,
        createdAt: "2026-03-24T10:00:02.000Z",
        updatedAt: "2026-03-24T10:00:02.000Z",
        source: "brain",
        toolId: "tool-2",
        toolName: "read_file",
        status: "completed",
        metadata: {
          family: TOOL_ACTIVITY_FAMILIES.READ,
          count: 1,
          truncated: false,
          preview: "content",
          loadedPaths: ["README.md"],
          path: "README.md",
        },
      },
      {
        id: "handoff-1",
        runId: "run-1",
        sessionId: "session-1",
        turnId: "turn-1",
        kind: ACTIVITY_PART_KINDS.HANDOFF,
        createdAt: "2026-03-24T10:00:03.000Z",
        updatedAt: "2026-03-24T10:00:03.000Z",
        source: "brain",
        targetMode: "build",
        summary: "Switch to build mode.",
        prompt: "Execute the approved plan.",
        status: "ready",
      },
    ],
  };
}
