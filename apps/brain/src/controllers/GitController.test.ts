import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitController } from "./GitController";
import type { Env } from "../types/ai";

describe("GitController", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it("routes git status through the canonical session-authenticated API", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "sess-git-1",
            token: "tok-git-1",
            expiresAt: Date.now() + 60_000,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            taskId: "git-status-task",
            status: "success",
            output: JSON.stringify({
              files: [],
              ahead: 0,
              behind: 0,
              branch: "main",
              hasStaged: false,
              hasUnstaged: false,
              gitAvailable: true,
            }),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const response = await GitController.getStatus(
      new Request("https://brain.local/api/git/status?runId=run-1&sessionId=session-1"),
      {
        MUSCLE_BASE_URL: "http://muscle.local",
        NODE_ENV: "test",
      } as Env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      branch: "main",
      gitAvailable: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [sessionUrl, sessionInit] = fetchMock.mock.calls[0]!;
    expect(sessionUrl).toBe("http://muscle.local/api/v1/session?session=session-1");
    expect(sessionInit?.method).toBe("POST");
    expect(JSON.parse(String(sessionInit?.body))).toMatchObject({
      runId: "run-1",
      taskId: "git-status-run-1",
      repoPath: ".",
    });

    const [executeUrl, executeInit] = fetchMock.mock.calls[1]!;
    expect(executeUrl).toBe("http://muscle.local/api/v1/execute?session=session-1");
    expect(executeInit?.headers).toMatchObject({
      Authorization: "Bearer tok-git-1",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(executeInit?.body))).toMatchObject({
      sessionId: "sess-git-1",
      action: "git.execute",
      params: {
        action: "git_status",
        runId: "run-1",
      },
      timeout: 12000,
    });
  });

  it("maps git contract failures to a typed controller error", async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "sess-git-2",
            token: "tok-git-2",
            expiresAt: Date.now() + 60_000,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error:
              "Validation failed: action invalid enum value, received 'git.execute'",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        ),
      );

    const response = await GitController.getStatus(
      new Request("https://brain.local/api/git/status?runId=run-1"),
      {
        MUSCLE_BASE_URL: "http://muscle.local",
        NODE_ENV: "test",
      } as Env,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "GIT_EXECUTION_CONTRACT_ERROR",
      retryable: true,
    });
  });
});
