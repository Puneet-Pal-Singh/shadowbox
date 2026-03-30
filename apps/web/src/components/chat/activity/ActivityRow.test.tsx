import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActivityRow } from "./ActivityRow.js";
import type { ActivityFeedRowViewModel } from "../../../services/activity/ActivityFeedViewModel.js";

describe("ActivityRow", () => {
  it("renders commentary rows with the commentary renderer", () => {
    render(
      <ActivityRow
        row={createCommentaryRow({
          text: "Regular assistant response",
        })}
        expanded={true}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("Commentary")).toBeInTheDocument();
    expect(screen.getAllByText("Regular assistant response")).toHaveLength(2);
    expect(screen.queryByText("Run update")).not.toBeInTheDocument();
  });

  it("renders recovery commentary rows with the recovery renderer", () => {
    render(
      <ActivityRow
        row={createCommentaryRow({
          text: "The model timed out before choosing the next action.",
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

function createCommentaryRow(
  overrides: Partial<
    Extract<ActivityFeedRowViewModel, { kind: "commentary" }>
  > = {},
): Extract<ActivityFeedRowViewModel, { kind: "commentary" }> {
  return {
    kind: "commentary",
    key: "commentary-row-1",
    phase: "commentary",
    status: "completed",
    text: "Default content",
    ...overrides,
  };
}
