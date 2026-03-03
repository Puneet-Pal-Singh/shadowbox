import type { HarnessId, HarnessAdapter, HarnessAdapterRegistry } from "../ports/HarnessAdapterPort.js";

/**
 * Default implementation of HarnessAdapterRegistry.
 * 
 * Provides the central registry for all harness adapters.
 * Prevents ad-hoc harness wiring by enforcing adapter-only composition.
 */
export class HarnessAdapterRegistryImpl implements HarnessAdapterRegistry {
  private registry: Map<HarnessId, HarnessAdapter> = new Map();

  register(harnessId: HarnessId, adapter: HarnessAdapter): void {
    if (this.registry.has(harnessId)) {
      throw new Error(
        `[harness/registry] Harness adapter already registered: ${harnessId}`,
      );
    }
    this.registry.set(harnessId, adapter);
  }

  get(harnessId: HarnessId): HarnessAdapter {
    const adapter = this.registry.get(harnessId);
    if (!adapter) {
      throw new Error(
        `[harness/registry] Harness adapter not found: ${harnessId}. Available: ${Array.from(
          this.registry.keys(),
        ).join(", ")}`,
      );
    }
    return adapter;
  }

  getAll(): Map<HarnessId, HarnessAdapter> {
    return new Map(this.registry);
  }

  has(harnessId: HarnessId): boolean {
    return this.registry.has(harnessId);
  }
}
