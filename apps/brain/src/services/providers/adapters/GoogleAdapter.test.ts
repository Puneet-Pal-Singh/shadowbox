import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleAdapter } from "./GoogleAdapter";

const mockGenerateText = vi.fn();
const mockGoogleModel = vi.fn();
const mockCreateGoogleGenerativeAI = vi.fn(() => mockGoogleModel);

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  streamText: vi.fn(),
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: (...args: unknown[]) =>
    mockCreateGoogleGenerativeAI(...args),
}));

describe("GoogleAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGoogleModel.mockReturnValue({ modelId: "gemini-2.5-flash-lite" });
  });

  it("normalizes malformed empty candidate responses from Gemini", async () => {
    mockGenerateText.mockRejectedValueOnce({
      statusCode: 200,
      responseBody: JSON.stringify({
        candidates: [
          {
            content: {
              role: "model",
            },
            finishReason: "STOP",
            index: 0,
          },
        ],
        usageMetadata: {
          promptTokenCount: 3338,
          totalTokenCount: 3338,
        },
      }),
    });

    const adapter = new GoogleAdapter({
      apiKey: "google-test-key",
    });

    const result = await adapter.generate({
      messages: [],
      model: "gemini-2.5-flash-lite",
      tools: {},
      temperature: 0.2,
    });

    expect(result).toEqual({
      content: "",
      usage: {
        provider: "google",
        model: "gemini-2.5-flash-lite",
        promptTokens: 3338,
        completionTokens: 0,
        totalTokens: 3338,
        raw: {
          promptTokens: 3338,
          completionTokens: 0,
        },
      },
      finishReason: "stop",
      toolCalls: [],
    });
  });

  it("rethrows non-recoverable generation errors", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("boom"));

    const adapter = new GoogleAdapter({
      apiKey: "google-test-key",
    });

    await expect(
      adapter.generate({
        messages: [],
        model: "gemini-2.5-flash-lite",
      }),
    ).rejects.toThrow("boom");
  });
});
