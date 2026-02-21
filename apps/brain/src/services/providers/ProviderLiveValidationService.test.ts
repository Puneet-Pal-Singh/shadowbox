import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../types/ai";
import { ProviderError, ValidationError } from "../../domain/errors";
import { ProviderLiveValidationService } from "./ProviderLiveValidationService";

describe("ProviderLiveValidationService", () => {
  it("rejects live validation when feature flag is disabled", () => {
    const service = ProviderLiveValidationService.fromEnv(
      createEnv({ BYOK_VALIDATE_LIVE_ENABLED: "false" }),
    );

    expect(() => service.ensureEnabled()).toThrow(ValidationError);
  });

  it("passes when provider endpoint returns success", async () => {
    const fetchMock = createFetchMock(new Response("{}", { status: 200 }));
    const service = ProviderLiveValidationService.fromEnv(
      createEnv({ BYOK_VALIDATE_LIVE_ENABLED: "true" }),
      fetchMock,
    );

    await expect(service.validate("openai", "sk_test_1234567890")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps 401 responses to AUTH_FAILED", async () => {
    const fetchMock = createFetchMock(new Response("{}", { status: 401 }));
    const service = ProviderLiveValidationService.fromEnv(
      createEnv({ BYOK_VALIDATE_LIVE_ENABLED: "true" }),
      fetchMock,
    );

    await expect(
      service.validate("groq", "gsk_test_1234567890"),
    ).rejects.toMatchObject({
      code: "AUTH_FAILED",
      status: 401,
    });
  });

  it("maps 429 responses to RATE_LIMITED", async () => {
    const fetchMock = createFetchMock(new Response("{}", { status: 429 }));
    const service = ProviderLiveValidationService.fromEnv(
      createEnv({ BYOK_VALIDATE_LIVE_ENABLED: "true" }),
      fetchMock,
    );

    await expect(
      service.validate("openrouter", "sk-or-test_1234567890"),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });

  it("maps network errors to provider unavailable", async () => {
    const fetchMock = vi.fn<
      Parameters<typeof fetch>,
      ReturnType<typeof fetch>
    >();
    fetchMock.mockRejectedValue(new Error("network down"));
    const service = ProviderLiveValidationService.fromEnv(
      createEnv({ BYOK_VALIDATE_LIVE_ENABLED: "true" }),
      fetchMock as unknown as typeof fetch,
    );

    await expect(
      service.validate("openai", "sk_test_1234567890"),
    ).rejects.toBeInstanceOf(ProviderError);
    await expect(
      service.validate("openai", "sk_test_1234567890"),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      status: 503,
    });
  });
});

function createFetchMock(response: Response): typeof fetch {
  const fetchMock = vi.fn<
    Parameters<typeof fetch>,
    ReturnType<typeof fetch>
  >();
  fetchMock.mockResolvedValue(response);
  return fetchMock as unknown as typeof fetch;
}

function createEnv(overrides: Partial<Env>): Env {
  return {
    ...overrides,
  } as Env;
}
