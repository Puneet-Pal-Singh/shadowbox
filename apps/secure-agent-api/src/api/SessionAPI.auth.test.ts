import { describe, expect, it } from "vitest";
import {
  handleCreateSession,
  handleDeleteSession,
  handleExecuteTask,
  handleStreamLogs,
} from "./SessionAPI";

function createSessionRequest(): Request {
  return new Request("http://localhost/api/v1/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runId: "run-auth-1",
      taskId: "task-auth-1",
      repoPath: "workspace/repo",
    }),
  });
}

async function createSession(): Promise<{ sessionId: string; token: string }> {
  const response = await handleCreateSession(createSessionRequest(), {});
  expect(response.status).toBe(201);
  return (await response.json()) as { sessionId: string; token: string };
}

interface ErrorBody {
  code: string;
}

interface DeleteBody {
  success: boolean;
}

function createDeleteRequest(sessionId: string, authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  return new Request(`http://localhost/api/v1/session/${sessionId}`, {
    method: "DELETE",
    headers,
  });
}

function createExecuteRequest(sessionId: string, authHeader?: string): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  return new Request("http://localhost/api/v1/execute", {
    method: "POST",
    headers,
    body: JSON.stringify({
      sessionId,
      command: "echo hello",
      cwd: "workspace/repo",
    }),
  });
}

function createLogsRequest(sessionId: string, authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  return new Request(`http://localhost/api/v1/logs?sessionId=${sessionId}`, {
    method: "GET",
    headers,
  });
}

describe("session auth hardening", () => {
  it("rejects execute without authorization header", async () => {
    const { sessionId } = await createSession();
    const response = await handleExecuteTask(createExecuteRequest(sessionId), {});

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("rejects execute with wrong bearer token", async () => {
    const { sessionId } = await createSession();
    const response = await handleExecuteTask(
      createExecuteRequest(sessionId, "Bearer tok_wrong"),
      {},
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns explicit non-implemented error for authorized execute requests", async () => {
    const { sessionId, token } = await createSession();
    const response = await handleExecuteTask(
      createExecuteRequest(sessionId, `Bearer ${token}`),
      {},
    );

    expect(response.status).toBe(501);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("EXECUTION_NOT_IMPLEMENTED");
  });

  it("rejects logs without authorization header", async () => {
    const { sessionId } = await createSession();
    const response = handleStreamLogs(createLogsRequest(sessionId));

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("allows logs with matching bearer token", async () => {
    const { sessionId, token } = await createSession();
    const response = handleStreamLogs(
      createLogsRequest(sessionId, `Bearer ${token}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
  });

  it("rejects delete without authorization header", async () => {
    const { sessionId } = await createSession();
    const response = handleDeleteSession(createDeleteRequest(sessionId));

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("rejects malformed bearer format and wrong token", async () => {
    const { sessionId } = await createSession();

    const malformed = handleDeleteSession(
      createDeleteRequest(sessionId, "Token abc123"),
    );
    expect(malformed.status).toBe(401);

    const wrong = handleDeleteSession(
      createDeleteRequest(sessionId, "Bearer tok_wrong"),
    );
    expect(wrong.status).toBe(401);
  });

  it("allows delete only with matching bearer token", async () => {
    const { sessionId, token } = await createSession();
    const response = handleDeleteSession(
      createDeleteRequest(sessionId, `Bearer ${token}`),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as DeleteBody;
    expect(body.success).toBe(true);
  });
});
