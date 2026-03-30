import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityRow } from "./ActivityRow.js";
import type { ActivityFeedRowViewModel } from "../../../services/activity/ActivityFeedViewModel.js";

describe("ActivityRow", () => {
  it("renders normal text rows with the generic text renderer", () => {
    render(
      <ActivityRow
        row={createTextRow({
          content: "Regular assistant response",
        })}
        expanded={true}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("Assistant update")).toBeInTheDocument();
    expect(screen.getAllByText("Regular assistant response")).toHaveLength(2);
    expect(screen.queryByText("Run update")).not.toBeInTheDocument();
  });

  it("renders recovery text rows with the recovery renderer", () => {
    render(
      <ActivityRow
        row={createTextRow({
          content: "The model timed out before choosing the next action.",
          metadata: {
            code: "TASK_EXECUTION_TIMEOUT",
            resumeHint: "Retry the task.",
            resumeActions: ["retry"],
          },
        })}
        expanded={true}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("Recoverable timeout")).toBeInTheDocument();
    expect(screen.getByText(/Retry the task\./i)).toBeInTheDocument();
  });
});

function createTextRow(
  overrides: Partial<Extract<ActivityFeedRowViewModel, { kind: "text" }>> = {},
): Extract<ActivityFeedRowViewModel, { kind: "text" }> {
  return {
    kind: "text",
    key: "text-row-1",
    role: "assistant",
    content: "Default content",
    ...overrides,
  };
}
