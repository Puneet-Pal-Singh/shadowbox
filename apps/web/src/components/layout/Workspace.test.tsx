import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Workspace } from "./Workspace";

const mockRefetchGitStatus = vi.hoisted(() => vi.fn(async () => {}));
const mockBootstrapGitWorkspace = vi.hoisted(() => vi.fn());
const mockChatState = vi.hoisted(() => ({
  messages: [],
  input: "",
  handleInputChange: vi.fn(),
  handleSubmit: vi.fn(),
  append: vi.fn(),
  stop: vi.fn(),
  isLoading: false,
  isHydrating: false,
  runId: "run-123",
  error: null as string | null,
  debugEvents: [],
}));
const mockGitHubTreeState = vi.hoisted(() => ({
  repoTree: [],
  isLoadingTree: false,
  repo: null as {
    owner: { login: string };
    name: string;
    full_name: string;
    html_url: string;
    default_branch: string;
  } | null,
  branch: "main",
  switchBranch: vi.fn(),
  isGitHubLoaded: false,
}));
const mockChatInterface = vi.hoisted(() =>
  vi.fn((props: unknown) => {
    void props;
    return <div>chat</div>;
  }),
);

vi.mock("../../hooks/useChat", () => ({
  useChat: () => mockChatState,
}));

vi.mock("../../hooks/useGitStatus", () => ({
  useGitStatus: () => ({
    status: {
      branch: "main",
      files: [],
      ahead: 0,
      behind: 0,
      hasStaged: false,
      hasUnstaged: false,
      gitAvailable: true,
    },
    refetch: mockRefetchGitStatus,
  }),
}));

vi.mock("../../hooks/useGitDiff", () => ({
  useGitDiff: () => ({
    fetch: vi.fn(),
    diff: null,
  }),
}));

vi.mock("./workspace/useWorkspaceState", () => ({
  useWorkspaceState: () => ({
    activeTab: "changes",
    setActiveTab: vi.fn(),
    sidebarWidth: 320,
    setSidebarWidth: vi.fn(),
    isResizing: false,
    setIsResizing: vi.fn(),
    selectedFile: null,
    setSelectedFile: vi.fn(),
    selectedDiff: null,
    setSelectedDiff: vi.fn(),
    isViewingContent: false,
    setIsViewingContent: vi.fn(),
    isLoadingContent: false,
    setIsLoadingContent: vi.fn(),
  }),
}));

vi.mock("./workspace/useGitHubTree", () => ({
  useGitHubTree: () => mockGitHubTreeState,
}));

vi.mock("./workspace/useFileLoader", () => ({
  useFileLoader: () => ({
    handleFileClick: vi.fn(),
    handleGitHubFileSelect: vi.fn(),
  }),
}));

vi.mock("../chat/ChatInterface", () => ({
  ChatInterface: (props: unknown) => mockChatInterface(props),
}));

vi.mock("../ui/Resizer", () => ({
  Resizer: () => null,
}));

vi.mock("./workspace/SidebarHeader", () => ({
  SidebarHeader: () => <div>header</div>,
}));

vi.mock("./workspace/SidebarContent", () => ({
  SidebarContent: () => <div>content</div>,
}));

vi.mock("../git/GitReviewContext", () => ({
  GitReviewProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../git/GitReviewDialog", () => ({
  GitReviewDialog: () => null,
}));

vi.mock("../../lib/git-workspace-bootstrap", () => ({
  bootstrapGitWorkspace: mockBootstrapGitWorkspace,
}));

describe("Workspace", () => {
  beforeEach(() => {
    mockChatInterface.mockClear();
    mockRefetchGitStatus.mockClear();
    mockBootstrapGitWorkspace.mockReset();
    mockBootstrapGitWorkspace.mockResolvedValue({ status: "ready" });
    mockChatState.isLoading = false;
    mockGitHubTreeState.repo = null;
    mockGitHubTreeState.branch = "main";
    mockGitHubTreeState.switchBranch.mockClear();
    mockGitHubTreeState.isGitHubLoaded = false;
  });

  it("refreshes git status when a chat run finishes", async () => {
    const onSessionStatusChange = vi.fn();
    const { rerender } = render(
      <Workspace
        sessionId="session-123"
        runId="run-123"
        repository="career-crew"
        onSessionStatusChange={onSessionStatusChange}
      />,
    );

    expect(mockRefetchGitStatus).not.toHaveBeenCalled();

    mockChatState.isLoading = true;
    rerender(
      <Workspace
        sessionId="session-123"
        runId="run-123"
        repository="career-crew"
        onSessionStatusChange={onSessionStatusChange}
      />,
    );

    expect(mockRefetchGitStatus).not.toHaveBeenCalled();
    expect(onSessionStatusChange).toHaveBeenCalledWith("running");

    mockChatState.isLoading = false;
    rerender(
      <Workspace
        sessionId="session-123"
        runId="run-123"
        repository="career-crew"
        onSessionStatusChange={onSessionStatusChange}
      />,
    );

    await waitFor(() => {
      expect(mockRefetchGitStatus).toHaveBeenCalledWith(true);
    });
    expect(onSessionStatusChange).toHaveBeenCalledWith("completed");
  });

  it("marks session as error when a run finishes with chat error", async () => {
    const onSessionStatusChange = vi.fn();
    const { rerender } = render(
      <Workspace
        sessionId="session-123"
        runId="run-123"
        repository="career-crew"
        onSessionStatusChange={onSessionStatusChange}
      />,
    );

    mockChatState.isLoading = true;
    rerender(
      <Workspace
        sessionId="session-123"
        runId="run-123"
        repository="career-crew"
        onSessionStatusChange={onSessionStatusChange}
      />,
    );

    mockChatState.isLoading = false;
    mockChatState.error = "Model timeout";
    rerender(
      <Workspace
        sessionId="session-123"
        runId="run-123"
        repository="career-crew"
        onSessionStatusChange={onSessionStatusChange}
      />,
    );

    await waitFor(() => {
      expect(onSessionStatusChange).toHaveBeenCalledWith("error");
    });

    mockChatState.error = null;
  });

  it("forces a fresh git status fetch after workspace bootstrap succeeds", async () => {
    mockGitHubTreeState.repo = {
      owner: { login: "Puneet-Pal-Singh" },
      name: "career-crew",
      full_name: "Puneet-Pal-Singh/career-crew",
      html_url: "https://github.com/Puneet-Pal-Singh/career-crew",
      default_branch: "main",
    };
    mockGitHubTreeState.isGitHubLoaded = true;

    render(
      <Workspace
        sessionId="session-123"
        runId="run-123"
        repository="Puneet-Pal-Singh/career-crew"
      />,
    );

    await waitFor(() => {
      expect(mockBootstrapGitWorkspace).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockRefetchGitStatus).toHaveBeenCalledWith(true);
    });
  });

  it("does not trigger workspace bootstrap while a run is actively loading", async () => {
    mockGitHubTreeState.repo = {
      owner: { login: "Puneet-Pal-Singh" },
      name: "career-crew",
      full_name: "Puneet-Pal-Singh/career-crew",
      html_url: "https://github.com/Puneet-Pal-Singh/career-crew",
      default_branch: "main",
    };
    mockGitHubTreeState.isGitHubLoaded = true;
    mockChatState.isLoading = true;

    render(
      <Workspace
        sessionId="session-123"
        runId="run-123"
        repository="Puneet-Pal-Singh/career-crew"
      />,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockBootstrapGitWorkspace).not.toHaveBeenCalled();
  });

  it("passes repo tree state to the chat interface", () => {
    mockGitHubTreeState.repo = {
      owner: { login: "Puneet-Pal-Singh" },
      name: "career-crew",
      full_name: "Puneet-Pal-Singh/career-crew",
      html_url: "https://github.com/Puneet-Pal-Singh/career-crew",
      default_branch: "main",
    };
    mockGitHubTreeState.isGitHubLoaded = true;

    render(
      <Workspace
        sessionId="session-123"
        runId="run-123"
        repository="career crew renamed"
      />,
    );

    expect(mockChatInterface).toHaveBeenCalledWith(
      expect.objectContaining({
        repoTree: [],
        isLoadingRepoTree: false,
      }),
    );
  });
});
