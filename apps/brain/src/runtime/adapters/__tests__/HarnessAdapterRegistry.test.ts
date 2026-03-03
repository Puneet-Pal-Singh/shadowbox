import { describe, it, expect } from "vitest";
import { HarnessAdapterRegistryImpl } from "../HarnessAdapterRegistryImpl.js";
import type {
  HarnessAdapter,
  HarnessCapabilities,
  HarnessId,
} from "../../ports/HarnessAdapterPort.js";

/**
 * Mock harness adapter for testing.
 * Implements all methods with exact port signatures.
 */
class MockHarnessAdapter implements HarnessAdapter {
  constructor(private id: HarnessId) {}

  getHarnessId(): HarnessId {
    return this.id;
  }

  getCapabilities(): HarnessCapabilities {
    return {
      supportsStreaming: true,
      supportsRealtime: true,
      maxConcurrentTasks: 10,
      timeoutMs: 30000,
    };
  }

  async initialize(_runId: string): Promise<void> {
    // Mock implementation
  }

  async cleanup(_runId: string): Promise<void> {
    // Mock implementation
  }

  validateConfiguration(_config: Record<string, unknown>): boolean {
    return true;
  }
}

describe("HarnessAdapterRegistry", () => {
  it("should register and retrieve adapters", () => {
    const registry = new HarnessAdapterRegistryImpl();
    const adapter = new MockHarnessAdapter("cloudflare-sandbox");

    registry.register("cloudflare-sandbox", adapter);

    const retrieved = registry.get("cloudflare-sandbox");
    expect(retrieved).toBe(adapter);
    expect(retrieved.getHarnessId()).toBe("cloudflare-sandbox");
  });

  it("should throw on duplicate registration", () => {
    const registry = new HarnessAdapterRegistryImpl();
    const adapter1 = new MockHarnessAdapter("cloudflare-sandbox");
    const adapter2 = new MockHarnessAdapter("cloudflare-sandbox");

    registry.register("cloudflare-sandbox", adapter1);

    expect(() => {
      registry.register("cloudflare-sandbox", adapter2);
    }).toThrow("Harness adapter already registered");
  });

  it("should throw on get for unregistered harness", () => {
    const registry = new HarnessAdapterRegistryImpl();

    expect(() => {
      registry.get("unknown-harness");
    }).toThrow("Harness adapter not found");
  });

  it("should check harness existence", () => {
    const registry = new HarnessAdapterRegistryImpl();
    const adapter = new MockHarnessAdapter("cloudflare-sandbox");

    expect(registry.has("cloudflare-sandbox")).toBe(false);

    registry.register("cloudflare-sandbox", adapter);

    expect(registry.has("cloudflare-sandbox")).toBe(true);
  });

  it("should return all registered adapters", () => {
    const registry = new HarnessAdapterRegistryImpl();
    const cloudflareAdapter = new MockHarnessAdapter("cloudflare-sandbox");
    const localAdapter = new MockHarnessAdapter("local-sandbox");

    registry.register("cloudflare-sandbox", cloudflareAdapter);
    registry.register("local-sandbox", localAdapter);

    const all = registry.getAll();
    expect(all.size).toBe(2);
    expect(all.get("cloudflare-sandbox")).toBe(cloudflareAdapter);
    expect(all.get("local-sandbox")).toBe(localAdapter);
  });

  it("should support multiple adapter registrations", () => {
    const registry = new HarnessAdapterRegistryImpl();

    const adapters: Array<[HarnessId, HarnessAdapter]> = [
      ["cloudflare-sandbox", new MockHarnessAdapter("cloudflare-sandbox")],
      ["local-sandbox", new MockHarnessAdapter("local-sandbox")],
    ];

    for (const [id, adapter] of adapters) {
      registry.register(id, adapter);
    }

    for (const [id, adapter] of adapters) {
      expect(registry.get(id)).toBe(adapter);
    }
  });

  it("should include available adapters in error message on not found", () => {
    const registry = new HarnessAdapterRegistryImpl();
    registry.register("cloudflare-sandbox", new MockHarnessAdapter("cloudflare-sandbox"));
    registry.register("local-sandbox", new MockHarnessAdapter("local-sandbox"));

    try {
      registry.get("unknown-harness");
      expect.fail("Should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("cloudflare-sandbox");
      expect(message).toContain("local-sandbox");
    }
  });
});
