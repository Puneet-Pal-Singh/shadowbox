/**
 * HarnessAdapterPort - Canonical boundary for harness integration.
 *
 * This port abstracts execution harness implementations (Cloudflare sandbox, local sandbox, etc.)
 * so that core runtime depends only on this contract, not harness-specific implementations.
 *
 * Canonical alignment: Charter 46, Plan 59 Runtime Decomposition, Plan 64 Agents SDK Adapter
 *
 * Key invariant: Core runtime MUST NOT import harness-specific modules directly.
 * All harness wiring goes through this port and adapter composition root.
 */

/**
 * Supported execution harness identifiers.
 * Extensible union type for future harness implementations.
 */
export type HarnessId = "cloudflare-sandbox" | "local-sandbox" | (string & {});

/**
 * Harness capability flags.
 * Describes what execution features a harness supports.
 */
export interface HarnessCapabilities {
  supportsStreaming: boolean;
  supportsRealtime: boolean;
  maxConcurrentTasks: number;
  timeoutMs: number;
}

/**
 * Harness adapter interface.
 * All harness-specific behavior is encapsulated behind this port.
 *
 * Implementations:
 * - CloudflareHarnessAdapter (for Cloudflare sandbox)
 * - LocalHarnessAdapter (for local/test environments)
 * - Future: CustomHarnessAdapter (for plugin harnesses)
 */
export interface HarnessAdapter {
  /**
   * Get the harness identifier.
   * @returns The unique harness ID this adapter implements
   */
  getHarnessId(): HarnessId;

  /**
   * Get harness capabilities.
   * @returns Capabilities supported by this harness
   */
  getCapabilities(): HarnessCapabilities;

  /**
   * Initialize the harness for a run.
   * @param runId - Unique run identifier
   * @returns Promise that resolves when harness is ready
   */
  initialize(runId: string): Promise<void>;

  /**
   * Cleanup resources after run completion.
   * @param runId - Unique run identifier
   */
  cleanup(runId: string): Promise<void>;

  /**
   * Validate that a configuration is compatible with this harness.
   * @param config - Configuration to validate (providerId, modelId, etc.)
   * @returns true if configuration is valid for this harness
   */
  validateConfiguration(config: Record<string, unknown>): boolean;
}

/**
 * Harness adapter registry.
 * Central registry for all available harness adapters.
 * Implements the composition root pattern to prevent ad-hoc harness wiring.
 */
export interface HarnessAdapterRegistry {
  /**
   * Register a harness adapter.
   * @param harnessId - Harness identifier
   * @param adapter - Harness adapter implementation
   * @throws Error if adapter with this ID already registered
   */
  register(harnessId: HarnessId, adapter: HarnessAdapter): void;

  /**
   * Get a harness adapter by ID.
   * @param harnessId - Harness identifier
   * @returns Adapter for the given harness ID
   * @throws Error if harness not found in registry
   */
  get(harnessId: HarnessId): HarnessAdapter;

  /**
   * Get all registered harnesses.
   * @returns Map of harness ID to adapter
   */
  getAll(): Map<HarnessId, HarnessAdapter>;

  /**
   * Check if a harness is registered.
   * @param harnessId - Harness identifier
   * @returns true if harness exists in registry
   */
  has(harnessId: HarnessId): boolean;
}
