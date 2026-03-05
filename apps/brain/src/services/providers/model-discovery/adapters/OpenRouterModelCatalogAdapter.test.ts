import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenRouterModelCatalogAdapter } from "./OpenRouterModelCatalogAdapter";

describe("OpenRouterModelCatalogAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes OpenRouter model payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "openai/gpt-4o",
              name: "GPT-4o",
              context_length: 128000,
              pricing: {
                prompt: "0.000005",
                completion: "0.000015",
              },
              supported_parameters: ["tools"],
              architecture: { modality: "text+image->text" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const adapter = new OpenRouterModelCatalogAdapter();
    const models = await adapter.fetchAll("openrouter", {
      userId: "user-1",
      workspaceId: "ws-1",
      apiKey: "sk-or-test",
    });

    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("openai/gpt-4o");
    expect(models[0].providerId).toBe("openrouter");
    expect(models[0].supportsTools).toBe(true);
    expect(models[0].supportsVision).toBe(true);
  });

  it("fails fast on provider API failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );

    const adapter = new OpenRouterModelCatalogAdapter();
    await expect(
      adapter.fetchAll("openrouter", {
        userId: "user-1",
        workspaceId: "ws-1",
        apiKey: "sk-or-test",
      }),
    ).rejects.toThrow("OpenRouter models request failed");
  });
});
