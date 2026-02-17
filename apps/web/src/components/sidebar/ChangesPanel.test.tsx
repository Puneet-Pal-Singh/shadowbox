import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChangesPanel } from "./ChangesPanel";

const mockRefetch = vi.hoisted(() => vi.fn(async () => {}));
const mockFetchDiff = vi.hoisted(() => vi.fn(async () => {}));
const mockCommit = vi.hoisted(() => vi.fn(async () => {}));
const mockGitStatusState = vi.hoisted(() => ({
  status: {
    branch: "main",
    files: [
      {
        path: "src/main.ts",
        status: "modified",
        staged: false,
        isStaged: false,
        additions: 1,
        deletions: 0,
      },
    ],
    summary: {
      staged: 0,
      unstaged: 1,
      untracked: 0,
    },
  },
  loading: false,
  error: null,
}));

vi.mock("../../hooks/useRunContext", () => ({
  useRunContext: () => ({ runId: "run-123" }),
}));

vi.mock("../../hooks/useGitStatus", () => ({
  useGitStatus: () => ({
    status: mockGitStatusState.status,
    loading: mockGitStatusState.loading,
    error: mockGitStatusState.error,
    refetch: mockRefetch,
  }),
}));

vi.mock("../../hooks/useGitDiff", () => ({
  useGitDiff: () => ({
    diff: null,
    loading: false,
    error: null,
    fetch: mockFetchDiff,
  }),
}));

vi.mock("../../hooks/useGitCommit", () => ({
  useGitCommit: () => ({
    committing: false,
    error: null,
    commit: mockCommit,
  }),
}));

vi.mock("../diff/ChangesList", () => ({
  ChangesList: ({
    onToggleStaged,
  }: {
    onToggleStaged: (path: string, staged: boolean) => void;
  }) => (
    <div>
      <button
        type="button"
        data-testid="stage-file"
        onClick={() => onToggleStaged("src/main.ts", true)}
      >
        stage
      </button>
      <button
        type="button"
        data-testid="unstage-file"
        onClick={() => onToggleStaged("src/main.ts", false)}
      >
        unstage
      </button>
    </div>
  ),
}));

vi.mock("../diff/DiffViewer", () => ({
  DiffViewer: () => <div>diff-viewer</div>,
}));

describe("ChangesPanel stage/unstage contract", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mockRefetch.mockClear();
    mockFetchDiff.mockClear();
    mockCommit.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockClear();
  });

  it("sends stage request with unstage=false", async () => {
    render(<ChangesPanel />);

    fireEvent.click(screen.getByTestId("stage-file"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { body: string; method: string },
    ];
    const body = JSON.parse(init.body) as {
      runId: string;
      files: string[];
      unstage: boolean;
    };

    expect(url).toContain("/api/git/stage");
    expect(init.method).toBe("POST");
    expect(body).toEqual({
      runId: "run-123",
      files: ["src/main.ts"],
      unstage: false,
    });
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("sends unstage request with unstage=true", async () => {
    render(<ChangesPanel />);

    fireEvent.click(screen.getByTestId("unstage-file"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { body: string; method: string },
    ];
    const body = JSON.parse(init.body) as {
      runId: string;
      files: string[];
      unstage: boolean;
    };

    expect(init.method).toBe("POST");
    expect(body.unstage).toBe(true);
    expect(body.files).toEqual(["src/main.ts"]);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
