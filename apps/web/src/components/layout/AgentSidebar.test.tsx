import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../../types/session";
import { AgentSidebar } from "./AgentSidebar";

function createSession(overrides?: Partial<AgentSession>): AgentSession {
  return {
    id: "session-1",
    name: "Draft task",
    repository: "shadowbox/shadowbox",
    activeRunId: "run-1",
    runIds: ["run-1"],
    status: "running",
    mode: "build",
    updatedAt: "2026-04-14T12:00:00.000Z",
    ...overrides,
  };
}

describe("AgentSidebar", () => {
  it("renders awaiting approval status when the session has a pending approval", () => {
    render(
      <AgentSidebar
        sessions={[createSession()]}
        repositories={["shadowbox/shadowbox"]}
        activeSessionId="session-1"
        approvalStatesBySessionId={{ "session-1": true }}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRemove={vi.fn()}
        onAddRepository={vi.fn()}
      />,
    );

    expect(screen.getByText("Awaiting approval")).toBeInTheDocument();
  });

  it("shows the awaiting approval filter option in the sidebar menu", () => {
    render(
      <AgentSidebar
        sessions={[createSession()]}
        repositories={["shadowbox/shadowbox"]}
        activeSessionId="session-1"
        approvalStatesBySessionId={{ "session-1": true }}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onRemove={vi.fn()}
        onAddRepository={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter tasks" }));
    expect(screen.getByRole("menuitemradio", { name: "Awaiting approval" })).toBeInTheDocument();
  });
});
