import { describe, expect, it } from "vitest";
import {
  handleCreateSession,
  handleDeleteSession,
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

function createDeleteRequest(
  sessionId: string,
  authHeader?: string,
): Request {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers.Authorization = authHeader;
  }

  return new Request(`http://localhost/api/v1/session/${sessionId}`, {
    method: "DELETE",
    headers,
  });
}

describe("session delete auth hardening", () => {
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
