import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatCore } from "./useChatCore";

const { mockUseChat, mockResolveForChat } = vi.hoisted(() => ({
  mockUseChat: vi.fn(),
  mockResolveForChat: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: mockUseChat,
}));

vi.mock("./useProviderStore.js", () => ({
  useProviderStore: () => ({
    status: "ready",
    credentials: [{ credentialId: "cred-axis", providerId: "axis" }],
    resolveForChat: mockResolveForChat,
  }),
}));

vi.mock("../lib/platform-endpoints.js", () => ({
  chatStreamPath: () => "https://brain.local/chat",
  getBrainHttpBase: () => "https://brain.local",
}));

vi.mock("../lib/run-summary-events.js", () => ({
  dispatchRunSummaryRefresh: vi.fn(),
}));

vi.mock("../services/SessionStateService", () => ({
  SessionStateService: {
    loadSessionGitHubContext: vi.fn(() => null),
  },
}));

describe("useChatCore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockResolveForChat.mockReset();
    mockUseChat.mockReset();
    mockUseChat.mockReturnValue({
      messages: [],
      input: "",
      handleInputChange: vi.fn(),
      isLoading: false,
      stop: vi.fn(),
      setMessages: vi.fn(),
      append: vi.fn(),
    });
    localStorage.clear();
  });

  it("configures chat requests with cookie credentials and bearer auth", async () => {
    localStorage.setItem("shadowbox_session", "session-token-123");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    renderHook(() => useChatCore("session-1"));

    const options = mockUseChat.mock.calls[0]?.[0] as {
      credentials?: RequestCredentials;
      fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
    };

    expect(options.credentials).toBe("include");
    expect(options.fetch).toBeDefined();

    await options.fetch?.("https://brain.local/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    expect(fetchSpy).toHaveBeenCalledWith("https://brain.local/chat", {
      method: "POST",
      credentials: "include",
      headers: expect.any(Headers),
    });

    const headers = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer session-token-123");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("surfaces expired session auth as a clear login message", () => {
    const { result } = renderHook(() => useChatCore("session-1"));

    const options = mockUseChat.mock.calls[0]?.[0] as {
      onError?: (error: Error) => void;
    };

    act(() => {
      options.onError?.(
        new Error(
          JSON.stringify({
            error: "Unauthorized: missing authentication token.",
            code: "AUTH_FAILED",
          }),
        ),
      );
    });

    expect(result.current.error).toBe(
      "Your session is missing or expired. Log in again and retry.",
    );
  });
});
