import { describe, expect, it } from "vitest";
import {
  handleCreateSession,
  handleDeleteSession,
  handleExecuteTask,
  handleStreamLogs,
} from "./SessionAPI";

interface SessionRecord {
  runId: string;
  taskId: string;
  repoPath: string;
  expiresAt: number;
  token: string;
  createdAt: number;
}

interface SessionLogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source?: "stdout" | "stderr";
}

interface RuntimeStoreMock extends Record<string, unknown> {
  storeExecutionSession: (
    sessionId: string,
    session: SessionRecord,
  ) => Promise<void>;
  getExecutionSession: (sessionId: string) => Promise<SessionRecord | null>;
  appendExecutionLog: (
    sessionId: string,
    entry: SessionLogEntry,
  ) => Promise<void>;
  getExecutionLogs: (
    sessionId: string,
    since?: number,
  ) => Promise<SessionLogEntry[]>;
  deleteExecutionSession: (sessionId: string) => Promise<void>;
}

function createRuntimeStoreMock(): RuntimeStoreMock {
  const sessions = new Map<string, SessionRecord>();
  const logs = new Map<string, SessionLogEntry[]>();

  return {
    async storeExecutionSession(sessionId, session) {
      sessions.set(sessionId, session);
      logs.set(sessionId, []);
    },
    async getExecutionSession(sessionId) {
      return sessions.get(sessionId) ?? null;
    },
    async appendExecutionLog(sessionId, entry) {
      const entries = logs.get(sessionId) ?? [];
      entries.push(entry);
      logs.set(sessionId, entries);
    },
    async getExecutionLogs(sessionId, since) {
      const entries = logs.get(sessionId) ?? [];
      if (since === undefined) {
        return entries;
      }
      return entries.filter((entry) => entry.timestamp > since);
    },
    async deleteExecutionSession(sessionId) {
      sessions.delete(sessionId);
      logs.delete(sessionId);
    },
  };
}

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

async function createSession(
  runtime: RuntimeStoreMock,
): Promise<{ sessionId: string; token: string }> {
  const response = await handleCreateSession(createSessionRequest(), runtime);
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
    const runtime = createRuntimeStoreMock();
    const { sessionId } = await createSession(runtime);
    const response = await handleExecuteTask(
      createExecuteRequest(sessionId),
      runtime,
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("rejects execute with wrong bearer token", async () => {
    const runtime = createRuntimeStoreMock();
    const { sessionId } = await createSession(runtime);
    const response = await handleExecuteTask(
      createExecuteRequest(sessionId, "Bearer tok_wrong"),
      runtime,
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns explicit non-implemented error for authorized execute requests", async () => {
    const runtime = createRuntimeStoreMock();
    const { sessionId, token } = await createSession(runtime);
    const response = await handleExecuteTask(
      createExecuteRequest(sessionId, `Bearer ${token}`),
      runtime,
    );

    expect(response.status).toBe(501);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("EXECUTION_NOT_IMPLEMENTED");
  });

  it("rejects logs without authorization header", async () => {
    const runtime = createRuntimeStoreMock();
    const { sessionId } = await createSession(runtime);
    const response = await handleStreamLogs(createLogsRequest(sessionId), runtime);

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("allows logs with matching bearer token", async () => {
    const runtime = createRuntimeStoreMock();
    const { sessionId, token } = await createSession(runtime);
    const response = await handleStreamLogs(
      createLogsRequest(sessionId, `Bearer ${token}`),
      runtime,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
  });

  it("rejects delete without authorization header", async () => {
    const runtime = createRuntimeStoreMock();
    const { sessionId } = await createSession(runtime);
    const response = await handleDeleteSession(
      createDeleteRequest(sessionId),
      runtime,
    );

    expect(response.status).toBe(401);
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("rejects malformed bearer format and wrong token", async () => {
    const runtime = createRuntimeStoreMock();
    const { sessionId } = await createSession(runtime);

    const malformed = await handleDeleteSession(
      createDeleteRequest(sessionId, "Token abc123"),
      runtime,
    );
    expect(malformed.status).toBe(401);

    const wrong = await handleDeleteSession(
      createDeleteRequest(sessionId, "Bearer tok_wrong"),
      runtime,
    );
    expect(wrong.status).toBe(401);
  });

  it("allows delete only with matching bearer token", async () => {
    const runtime = createRuntimeStoreMock();
    const { sessionId, token } = await createSession(runtime);
    const response = await handleDeleteSession(
      createDeleteRequest(sessionId, `Bearer ${token}`),
      runtime,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as DeleteBody;
    expect(body.success).toBe(true);
  });
});
