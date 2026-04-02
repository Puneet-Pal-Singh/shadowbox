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
        displayMode="transcript"
      />,
    );

    expect(screen.getByText("Regular assistant response")).toBeInTheDocument();
    expect(screen.queryByText("Commentary")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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

  it("renders TASK_MODEL_NO_ACTION rows with a non-blaming label", () => {
    render(
      <ActivityRow
        row={createCommentaryRow({
          text: "The model did not return a usable next action for this edit request.",
          metadata: {
            code: "TASK_MODEL_NO_ACTION",
            resumeHint:
              "Retry the task or switch to a faster or more reliable model.",
            resumeActions: ["retry", "switch_model"],
          },
        })}
        expanded={true}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("Model stalled")).toBeInTheDocument();
    expect(
      screen.getByText(/Retry the task or switch to a faster or more reliable model\./i),
    ).toBeInTheDocument();
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
