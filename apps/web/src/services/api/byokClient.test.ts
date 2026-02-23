/**
 * ByokApiClient Tests
 *
 * Tests for HTTP request handling, error mapping, and response validation.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ByokApiClient, ByokApiError } from "./byokClient.js";

describe("ByokApiClient", () => {
  let client: ByokApiClient;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new ByokApiClient();
    fetchSpy = vi.spyOn(globalThis, "fetch") as unknown as ReturnType<
      typeof vi.spyOn
    >;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getCatalog", () => {
    it("fetches provider catalog", async () => {
      const mockCatalog = [
        {
          providerId: "openai",
          displayName: "OpenAI",
          authModes: ["api_key"],
        },
      ];

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockCatalog),
      });

      const catalog = await client.getCatalog();

      expect(fetchSpy).toHaveBeenCalledWith("/api/byok/providers", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
      expect(catalog).toEqual(mockCatalog);
    });
  });

  describe("getCredentials", () => {
    it("fetches credentials", async () => {
      const mockCredentials = [
        {
          id: "cred-1",
          providerId: "openai",
          status: "connected",
        },
      ];

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockCredentials),
      });

      const credentials = await client.getCredentials();

      expect(fetchSpy).toHaveBeenCalledWith("/api/byok/credentials", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
      expect(credentials).toEqual(mockCredentials);
    });
  });

  describe("connectCredential", () => {
    it("connects a new credential", async () => {
      const mockCredential = {
        id: "cred-1",
        providerId: "openai",
        status: "connected",
      };

      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(mockCredential),
      });

      const credential = await client.connectCredential({
        providerId: "openai",
        secret: "sk-test",
      });

      expect(fetchSpy).toHaveBeenCalledWith("/api/byok/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
        body: JSON.stringify({
          providerId: "openai",
          secret: "sk-test",
        }),
      });
      expect(credential).toEqual(mockCredential);
    });
  });

  describe("disconnectCredential", () => {
    it("disconnects credential", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      await client.disconnectCredential("cred-1");

      expect(fetchSpy).toHaveBeenCalledWith("/api/byok/credentials/cred-1", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        signal: undefined,
      });
    });
  });

  describe("validateCredential", () => {
    it("validates credential with format mode", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ valid: true }),
      });

      const result = await client.validateCredential("cred-1", {
        mode: "format",
      });

      expect(result).toEqual({ valid: true });
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/byok/credentials/cred-1/validate",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ mode: "format" }),
        })
      );
    });

    it("validates credential with live mode", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ valid: true }),
      });

      const result = await client.validateCredential("cred-1", {
        mode: "live",
      });

      expect(result).toEqual({ valid: true });
    });
  });

  describe("error handling", () => {
    it("maps HTTP 400 error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValueOnce({
          error: {
            code: "INVALID_INPUT",
            message: "Provider ID is invalid",
          },
        }),
      });

      try {
        await client.getCatalog();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(ByokApiError);
        expect((error as ByokApiError).code).toBe("INVALID_INPUT");
        expect((error as ByokApiError).statusCode).toBe(400);
      }
    });

    it("marks 5xx errors as retryable", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers({}),
        json: vi.fn().mockResolvedValueOnce({
          error: { code: "INTERNAL_ERROR", message: "Internal server error" },
        }),
      });

      try {
        await client.getCatalog();
      } catch (error) {
        expect((error as ByokApiError).isRetryable()).toBe(true);
      }
    });

    it("marks 429 errors as retryable", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({}),
        json: vi.fn().mockResolvedValueOnce({
          error: { code: "RATE_LIMIT", message: "Too many requests" },
        }),
      });

      try {
        await client.getCatalog();
      } catch (error) {
        expect((error as ByokApiError).isRetryable()).toBe(true);
      }
    });

    it("handles network errors", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("Network unreachable"));

      try {
        await client.getCatalog();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(ByokApiError);
        expect((error as ByokApiError).code).toBe("NETWORK_ERROR");
      }
    });

    it("handles abort signal", async () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      fetchSpy.mockRejectedValueOnce(error);

      try {
        await client.getCatalog();
        expect.fail("Should have thrown error");
      } catch (error) {
        expect(error).toBeInstanceOf(ByokApiError);
        expect((error as ByokApiError).code).toBe("ABORTED");
      }
    });

    it("includes correlationId in error", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ "content-type": "application/json" }),
        json: vi.fn().mockResolvedValueOnce({
          error: {
            code: "INVALID_INPUT",
            message: "Invalid credential",
            correlationId: "req-123",
          },
        }),
      });

      try {
        await client.getCatalog();
      } catch (error) {
        expect((error as ByokApiError).correlationId).toBe("req-123");
      }
    });
  });

  describe("abort", () => {
    it("aborts in-flight request", async () => {
      const abortSpy = vi.spyOn(AbortController.prototype, "abort");

      client.abort("test-key");

      expect(abortSpy).not.toHaveBeenCalled(); // No request was made
    });
  });
});
