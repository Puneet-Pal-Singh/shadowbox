import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleModelCatalogAdapter } from "./OpenAICompatibleModelCatalogAdapter";

describe("OpenAICompatibleModelCatalogAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes OpenAI-compatible model response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-4o" },
            { id: "gpt-4o-mini" },
          ],
        }),
        { status: 200 },
      ),
    );

    const adapter = new OpenAICompatibleModelCatalogAdapter(
      "openai",
      "https://api.openai.com/v1",
    );
    const models = await adapter.fetchAll("openai", {
      userId: "user-1",
      workspaceId: "ws-1",
      apiKey: "sk-test",
    });

    expect(models).toHaveLength(2);
    expect(models[0].providerId).toBe("openai");
    expect(models[0].id).toBe("gpt-4o");
  });

  it("wraps network failures into typed discovery errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const adapter = new OpenAICompatibleModelCatalogAdapter(
      "openai",
      "https://api.openai.com/v1",
    );
    await expect(
      adapter.fetchAll("openai", {
        userId: "user-1",
        workspaceId: "ws-1",
        apiKey: "sk-test",
      }),
    ).rejects.toThrow("network error");
  });

  it("rejects invalid pagination cursors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "gpt-4o" }] }), { status: 200 }),
    );

    const adapter = new OpenAICompatibleModelCatalogAdapter(
      "openai",
      "https://api.openai.com/v1",
    );
    await expect(
      adapter.fetchPage({
        providerId: "openai",
        credentialContext: {
          userId: "user-1",
          workspaceId: "ws-1",
          apiKey: "sk-test",
        },
        limit: 10,
        cursor: "-1",
      }),
    ).rejects.toThrow("Invalid pagination cursor");
  });
});
