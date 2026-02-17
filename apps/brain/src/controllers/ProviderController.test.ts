/**
 * ProviderController Tests
 * Unit tests for provider endpoint handlers
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProviderController } from "./ProviderController";
import type { Env } from "../types/ai";
import { ProviderConfigService } from "../services/ProviderConfigService";

const mockEnv: Env = {
  RUN_ENGINE_RUNTIME: {} as any,
  LLM_PROVIDER: "litellm",
  DEFAULT_MODEL: "llama-3.3-70b-versatile",
  GROQ_API_KEY: "test-key",
} as unknown as Env;

describe("ProviderController", () => {
  beforeEach(() => {
    ProviderConfigService.resetForTests();
  });

  describe("connect", () => {
    it("should connect provider with valid API key", async () => {
      const request = new Request("http://localhost/api/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-test-1234567890",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.connect(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe("connected");
      expect(data.providerId).toBe("openai");
    });

    it("should fail with empty API key", async () => {
      const request = new Request("http://localhost/api/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.connect(request, mockEnv);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("Validation error");
    });

    it("should fail with short API key", async () => {
      const request = new Request("http://localhost/api/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "short",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.connect(request, mockEnv);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("at least 10 characters");
    });

    it("should fail with invalid API key format", async () => {
      const request = new Request("http://localhost/api/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "sk-test@!#$%^invalid",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.connect(request, mockEnv);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("invalid characters");
    });

    it("should fail with wrong OpenAI key format", async () => {
      const request = new Request("http://localhost/api/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
          apiKey: "invalid-key-format-1234",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.connect(request, mockEnv);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("Invalid API key format");
    });

    it("should fail with wrong OpenRouter key format", async () => {
      const request = new Request("http://localhost/api/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openrouter",
          apiKey: "sk-test-1234567890",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.connect(request, mockEnv);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("Invalid API key format");
    });

    it("should fail with invalid provider ID", async () => {
      const request = new Request("http://localhost/api/providers/connect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "invalid",
          apiKey: "sk-test-1234567890",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.connect(request, mockEnv);
      expect(response.status).toBe(400);
    });

    it("should fail with malformed JSON", async () => {
      const request = new Request("http://localhost/api/providers/connect", {
        method: "POST",
        body: "{invalid json",
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.connect(request, mockEnv);
      expect(response.status).toBe(400);
    });
  });

  describe("disconnect", () => {
    it("should disconnect provider", async () => {
      const request = new Request("http://localhost/api/providers/disconnect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "openai",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.disconnect(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe("disconnected");
      expect(data.providerId).toBe("openai");
    });

    it("should fail with invalid provider ID", async () => {
      const request = new Request("http://localhost/api/providers/disconnect", {
        method: "POST",
        body: JSON.stringify({
          providerId: "invalid",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const response = await ProviderController.disconnect(request, mockEnv);
      expect(response.status).toBe(400);
    });
  });

  describe("status", () => {
    it("should return status for all providers", async () => {
      const request = new Request("http://localhost/api/providers/status", {
        method: "GET",
      });

      const response = await ProviderController.status(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.providers).toBeDefined();
      expect(Array.isArray(data.providers)).toBe(true);
      expect(data.providers.length).toBeGreaterThan(0);
    });

    it("should show disconnected status initially", async () => {
      const request = new Request("http://localhost/api/providers/status", {
        method: "GET",
      });

      const response = await ProviderController.status(request, mockEnv);
      const data = await response.json();

      const providers = data.providers as Array<{ status: string }>;
      expect(providers.every((p) => p.status === "disconnected")).toBe(true);
    });
  });

  describe("models", () => {
    it("should return models for OpenAI provider", async () => {
      const request = new Request(
        "http://localhost/api/providers/models?providerId=openai",
        {
          method: "GET",
        },
      );

      const response = await ProviderController.models(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.providerId).toBe("openai");
      expect(Array.isArray(data.models)).toBe(true);
      expect(data.models.length).toBeGreaterThan(0);
    });

    it("should return models for OpenRouter provider", async () => {
      const request = new Request(
        "http://localhost/api/providers/models?providerId=openrouter",
        {
          method: "GET",
        },
      );

      const response = await ProviderController.models(request, mockEnv);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.providerId).toBe("openrouter");
      expect(Array.isArray(data.models)).toBe(true);
    });

    it("should fail with missing providerId query param", async () => {
      const request = new Request(
        "http://localhost/api/providers/models",
        {
          method: "GET",
        },
      );

      const response = await ProviderController.models(request, mockEnv);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain("providerId");
    });

    it("should fail with invalid providerId", async () => {
      const request = new Request(
        "http://localhost/api/providers/models?providerId=invalid",
        {
          method: "GET",
        },
      );

      const response = await ProviderController.models(request, mockEnv);
      expect(response.status).toBe(400);
    });
  });
});
