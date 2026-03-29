import { describe, expect, it, vi } from "vitest";
import { ExecutionService } from "./ExecutionService";
import type { Env } from "../types/ai";

describe("ExecutionService", () => {
  it("creates a secure session once and executes canonical task requests", async () => {
    const fetchMock = vi.fn<
      Parameters<Env["SECURE_API"]["fetch"]>,
      ReturnType<Env["SECURE_API"]["fetch"]>
    >();

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "sess-1",
            token: "tok-1",
            expiresAt: Date.now() + 60_000,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            taskId: "task-1",
            status: "success",
            output: "file contents",
            metrics: { duration: 8 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            taskId: "task-2",
            status: "success",
            output: "second call",
            metrics: { duration: 9 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const service = new ExecutionService(
      {
        SECURE_API: { fetch: fetchMock },
      } as unknown as Env,
      "session-123",
      "run-456",
    );

    const first = await service.execute("filesystem", "read_file", {
      path: "src/index.ts",
    });
    const second = await service.execute("node", "run", {
      command: "pnpm test",
    });

    expect(first).toEqual({ success: true, output: "file contents" });
    expect(second).toEqual({ success: true, output: "second call" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [sessionUrl, sessionInit] = fetchMock.mock.calls[0]!;
    expect(sessionUrl).toBe("http://internal/api/v1/session?session=session-123");
    expect(sessionInit?.method).toBe("POST");
    expect(JSON.parse(String(sessionInit?.body))).toMatchObject({
      runId: "run-456",
      taskId: "brain-session-session-123",
      repoPath: ".",
    });

    const [executeUrl, executeInit] = fetchMock.mock.calls[1]!;
    expect(executeUrl).toBe("http://internal/api/v1/execute?session=session-123");
    expect(executeInit?.headers).toMatchObject({
      Authorization: "Bearer tok-1",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(executeInit?.body))).toMatchObject({
      sessionId: "sess-1",
      action: "filesystem.execute",
      params: {
        action: "read_file",
        runId: "run-456",
        path: "src/index.ts",
      },
      timeout: 120000,
    });
  });

  it("maps task failures back into the legacy execution shape", async () => {
    const fetchMock = vi.fn<
      Parameters<Env["SECURE_API"]["fetch"]>,
      ReturnType<Env["SECURE_API"]["fetch"]>
    >();

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "sess-2",
            token: "tok-2",
            expiresAt: Date.now() + 60_000,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            taskId: "task-fail",
            status: "failure",
            error: {
              code: "PLUGIN_EXECUTION_FAILED",
              message: "command failed",
            },
            metrics: { duration: 12 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const service = new ExecutionService(
      {
        SECURE_API: { fetch: fetchMock },
      } as unknown as Env,
      "session-abc",
      "run-def",
    );

    await expect(
      service.execute("node", "run", { command: "pnpm lint" }),
    ).resolves.toEqual({
      success: false,
      error: "command failed",
    });
  });

  it("normalizes git actions before sending execute payloads", async () => {
    const fetchMock = vi.fn<
      Parameters<Env["SECURE_API"]["fetch"]>,
      ReturnType<Env["SECURE_API"]["fetch"]>
    >();

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "sess-git",
            token: "tok-git",
            expiresAt: Date.now() + 60_000,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            taskId: "task-git",
            status: "success",
            output: "ok",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const service = new ExecutionService(
      {
        SECURE_API: { fetch: fetchMock },
      } as unknown as Env,
      "session-git",
      "run-git",
    );

    await service.execute("git", "status", {});

    const [, executeInit] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(String(executeInit?.body))).toMatchObject({
      action: "git.execute",
      params: {
        action: "git_status",
        runId: "run-git",
      },
      timeout: 12000,
    });
  });

  it("does not allow payload to override canonical action or runId", async () => {
    const fetchMock = vi.fn<
      Parameters<Env["SECURE_API"]["fetch"]>,
      ReturnType<Env["SECURE_API"]["fetch"]>
    >();

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessionId: "sess-node",
            token: "tok-node",
            expiresAt: Date.now() + 60_000,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            taskId: "task-node",
            status: "success",
            output: "ok",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

    const service = new ExecutionService(
      {
        SECURE_API: { fetch: fetchMock },
      } as unknown as Env,
      "session-node",
      "run-owned-by-service",
    );

    await service.execute("node", "run", {
      action: "write_file",
      runId: "run-from-caller",
      command: "echo hi",
    });

    const [, executeInit] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(String(executeInit?.body))).toMatchObject({
      action: "node.execute",
      params: {
        action: "run",
        runId: "run-owned-by-service",
        command: "echo hi",
      },
    });
  });

  it("filters streamed log polling by task id", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123456789);
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    let logPollCount = 0;
    const fetchMock = vi.fn<
      Parameters<Env["SECURE_API"]["fetch"]>,
      ReturnType<Env["SECURE_API"]["fetch"]>
    >(async (url) => {
      const value = String(url);

      if (value.startsWith("http://internal/api/v1/session")) {
        return new Response(
          JSON.stringify({
            sessionId: "sess-stream",
            token: "tok-stream",
            expiresAt: Date.now() + 60_000,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      if (value.startsWith("http://internal/api/v1/logs")) {
        const parsed = new URL(value);
        const taskId = parsed.searchParams.get("taskId");
        expect(taskId).toMatch(/^filesystem-read_file-123456789-/);
        logPollCount += 1;
        const body =
          logPollCount >= 2
            ? `data: ${JSON.stringify({ taskId, timestamp: 2, level: "info", message: "chunk", source: "stdout" })}\n\n`
            : "";
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }

      return new Response(
        JSON.stringify({
          taskId: "filesystem-read_file-task",
          status: "success",
          output: "done",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const service = new ExecutionService(
      {
        SECURE_API: { fetch: fetchMock },
      } as unknown as Env,
      "session-stream",
      "run-stream",
    );

    const chunks: Array<{ message: string; source?: "stdout" | "stderr" }> = [];
    await service.execute(
      "filesystem",
      "read_file",
      { path: "src/index.ts" },
      {
        onOutput: async (chunk) => {
          chunks.push(chunk);
        },
      },
    );

    expect(chunks).toEqual([{ message: "chunk", source: "stdout", timestamp: 2 }]);
    nowSpy.mockRestore();
    randomSpy.mockRestore();
  });
});
