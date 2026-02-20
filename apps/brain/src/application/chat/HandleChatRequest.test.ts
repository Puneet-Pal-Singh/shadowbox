import type { CoreMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../types/ai";
import { ValidationError } from "../../domain/errors";
import { PersistenceService } from "../../services/PersistenceService";
import { HandleChatRequest } from "./HandleChatRequest";

describe("HandleChatRequest", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds execution payload and persists the last user message", async () => {
    const persistSpy = vi
      .spyOn(PersistenceService.prototype, "persistUserMessage")
      .mockResolvedValue();

    const useCase = new HandleChatRequest(createEnv());
    const messages: CoreMessage[] = [
      { role: "system", content: "You are helpful" },
      { role: "user", content: "first user" },
      { role: "assistant", content: "assistant response" },
      { role: "user", content: "latest user prompt" },
    ];

    const result = await useCase.execute(
      {
        sessionId: "session-1",
        runId: "123e4567-e89b-42d3-a456-426614174000",
        correlationId: "corr-1",
        agentType: "coding",
        prompt: "latest user prompt",
        messages,
        providerId: "openai",
        modelId: "gpt-4",
      },
      "https://shadowbox.local",
    );

    expect(result.success).toBe(true);
    expect(result.executionPayload.input.agentType).toBe("coding");
    expect(result.executionPayload.input.providerId).toBe("openai");
    expect(result.executionPayload.input.modelId).toBe("gpt-4");
    expect(result.executionPayload.requestOrigin).toBe("https://shadowbox.local");
    expect(result.executionPayload.messages).toEqual(messages);
    expect(persistSpy).toHaveBeenCalledWith(
      "session-1",
      "123e4567-e89b-42d3-a456-426614174000",
      { role: "user", content: "latest user prompt" },
    );
  });

  it("throws NO_MESSAGES when messages are empty", async () => {
    vi.spyOn(PersistenceService.prototype, "persistUserMessage").mockResolvedValue();

    const useCase = new HandleChatRequest(createEnv());

    await expect(
      useCase.execute({
        sessionId: "session-1",
        runId: "123e4567-e89b-42d3-a456-426614174000",
        correlationId: "corr-2",
        agentType: "coding",
        prompt: "hello",
        messages: [],
      }),
    ).rejects.toMatchObject<Partial<ValidationError>>({
      code: "NO_MESSAGES",
    });
  });

  it("throws NO_USER_MESSAGE when history has no user messages", async () => {
    vi.spyOn(PersistenceService.prototype, "persistUserMessage").mockResolvedValue();

    const useCase = new HandleChatRequest(createEnv());

    await expect(
      useCase.execute({
        sessionId: "session-1",
        runId: "123e4567-e89b-42d3-a456-426614174000",
        correlationId: "corr-3",
        agentType: "coding",
        prompt: "hello",
        messages: [{ role: "assistant", content: "only assistant" }],
      }),
    ).rejects.toMatchObject<Partial<ValidationError>>({
      code: "NO_USER_MESSAGE",
    });
  });

  it("continues when persistence fails and still returns execution payload", async () => {
    const persistSpy = vi
      .spyOn(PersistenceService.prototype, "persistUserMessage")
      .mockRejectedValue(new Error("storage unavailable"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const useCase = new HandleChatRequest(createEnv());
    const result = await useCase.execute({
      sessionId: "session-1",
      runId: "123e4567-e89b-42d3-a456-426614174000",
      correlationId: "corr-4",
      agentType: "coding",
      prompt: "hello",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.success).toBe(true);
    expect(persistSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });
});

function createEnv(): Env {
  return {
    AI: {} as Env["AI"],
    SECURE_API: {
      fetch: vi.fn(async () => new Response(JSON.stringify({ success: true }))),
    } as unknown as Env["SECURE_API"],
    GITHUB_CLIENT_ID: "x",
    GITHUB_CLIENT_SECRET: "x",
    GITHUB_REDIRECT_URI: "x",
    GITHUB_TOKEN_ENCRYPTION_KEY: "x",
    SESSION_SECRET: "x",
    FRONTEND_URL: "x",
    SESSIONS: {} as Env["SESSIONS"],
    RUN_ENGINE_RUNTIME: {} as Env["RUN_ENGINE_RUNTIME"],
  };
}
