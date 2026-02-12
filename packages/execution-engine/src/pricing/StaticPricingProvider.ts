/**
 * StaticPricingProvider - Load pricing from static JSON configuration
 *
 * MVP Implementation for Phase 2.5
 * - Reads pricing.json at initialization
 * - No external I/O or caching (can be added in Phase 3)
 * - Deterministic and testable
 *
 * SOLID Principles:
 * - SRP: Only loads and serves pricing from config
 * - LSP: Implements PricingProvider contract faithfully
 * - DIP: Used via PricingProvider interface, not directly
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import {
  PricingProvider,
  ModelPricingData,
  ModelPricingDataSchema,
  DEFAULT_PRICING_CURRENCY
} from './PricingProvider.js'

/**
 * Metadata for pricing configuration
 * Tracks staleness and deprecation status
 */
interface PricingMetadata {
  version: string
  lastUpdated: string
  stalePolicyDays: number
  deprecationWarning: string
  note: string
}

/**
 * Raw pricing configuration structure before normalization
 * Matches pricing.json file format
 */
interface RawPricingConfig {
  _metadata?: PricingMetadata
  [provider: string]: {
    [model: string]: Omit<ModelPricingData, 'model' | 'provider'> & {
      model?: string
      provider?: string
    }
  } | PricingMetadata
}

/**
 * StaticPricingProvider: MVP pricing provider
 * Loads from pricing.json, validates with Zod, serves via interface
 */
export class StaticPricingProvider implements PricingProvider {
  /**
   * In-memory pricing cache
   * Structure: provider -> model -> pricing data
   */
  private readonly pricingMap: Map<string, Map<string, ModelPricingData>>

  /**
   * Pricing metadata (version, update timestamp, deprecation info)
   */
  private readonly metadata: PricingMetadata | undefined

  /**
   * Initialize from pricing.json
   * @throws If pricing.json not found or invalid
   */
  constructor(pricingFilePath?: string) {
    const filePath = pricingFilePath || this.getDefaultPricingPath()

    console.log('[pricing/static] Loading pricing from:', filePath)
    const rawConfig = this.loadPricingFile(filePath)

    // Extract and validate metadata
    this.metadata = rawConfig._metadata
    if (this.metadata) {
      this.checkStaleness(this.metadata)
      console.log('[pricing/static] Deprecation Warning:', this.metadata.deprecationWarning)
    }

    // Normalize and validate pricing data
    this.pricingMap = this.buildPricingMap(rawConfig)

    console.log(
      '[pricing/static] Loaded pricing for:',
      Array.from(this.pricingMap.keys()).join(', ')
    )
  }

  /**
   * Get pricing for a model and provider
   * @throws If model/provider combination not found
   */
  async getPricing(model: string, provider: string): Promise<ModelPricingData> {
    const providerMap = this.pricingMap.get(provider)
    if (!providerMap) {
      throw new Error(
        `[pricing/static] Provider not found: "${provider}". ` +
        `Available: ${Array.from(this.pricingMap.keys()).join(', ')}`
      )
    }

    const pricing = providerMap.get(model)
    if (!pricing) {
      const availableModels = Array.from(providerMap.keys())
      throw new Error(
        `[pricing/static] Model not found: "${model}" for provider "${provider}". ` +
        `Available models: ${availableModels.join(', ')}`
      )
    }

    return pricing
  }

  /**
   * List all unique model names across all providers
   */
  async listAvailableModels(): Promise<string[]> {
    const models = new Set<string>()
    for (const providerMap of this.pricingMap.values()) {
      for (const model of providerMap.keys()) {
        models.add(model)
      }
    }
    return Array.from(models).sort()
  }

  /**
   * List all supported providers
   */
  async listSupportedProviders(): Promise<string[]> {
    return Array.from(this.pricingMap.keys()).sort()
  }

  /**
   * Load and parse pricing.json file
   * @throws If file not found or invalid JSON
   */
  private loadPricingFile(filePath: string): RawPricingConfig {
    try {
      const content = readFileSync(filePath, 'utf-8')
      const config = JSON.parse(content) as RawPricingConfig
      return config
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `[pricing/static] Invalid JSON in pricing file: ${filePath}`
        )
      }
      throw new Error(
        `[pricing/static] Failed to read pricing file: ${filePath}. ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Build normalized pricing map from raw config
   * Validates each pricing entry with Zod
   * Skips metadata entries
   */
  private buildPricingMap(
    config: RawPricingConfig
  ): Map<string, Map<string, ModelPricingData>> {
    const map = new Map<string, Map<string, ModelPricingData>>()

    for (const [provider, models] of Object.entries(config)) {
      // Skip metadata
      if (provider === '_metadata' || typeof models !== 'object' || models === null) {
        continue
      }

      const providerMap = new Map<string, ModelPricingData>()

      for (const [model, rawData] of Object.entries(models as Record<string, any>)) {
        // Ensure model and provider are set
         const data: ModelPricingData = {
           model: rawData.model || model,
           provider: rawData.provider || provider,
           inputPer1k: rawData.inputPer1k,
           outputPer1k: rawData.outputPer1k,
           lastUpdated: rawData.lastUpdated,
           currency: rawData.currency || DEFAULT_PRICING_CURRENCY
         }

        // Validate schema
        const validation = ModelPricingDataSchema.safeParse(data)
        if (!validation.success) {
          throw new Error(
            `[pricing/static] Invalid pricing for ${provider}/${model}: ` +
            validation.error.message
          )
        }

        providerMap.set(model, validation.data)
      }

      map.set(provider, providerMap)
    }

    return map
  }

  /**
   * Get default pricing.json path
   * Works with both CJS and ESM
   */
  private getDefaultPricingPath(): string {
    try {
      // ESM: Use __dirname equivalent
      const __filename = fileURLToPath(import.meta.url)
      const __dirname = join(__filename, '..')
      return join(__dirname, 'pricing.json')
    } catch {
      // CJS fallback
      return join(__dirname, 'pricing.json')
    }
  }

  /**
   * Check if pricing data is stale and warn if needed
   * @param metadata Pricing metadata
   * @throws If pricing is critically stale (>180 days)
   */
  private checkStaleness(metadata: PricingMetadata): void {
    const lastUpdated = new Date(metadata.lastUpdated)
    const now = new Date()
    const daysOld = Math.floor((now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24))
    const stalePolicy = metadata.stalePolicyDays || 90

    if (daysOld > stalePolicy) {
      const message = `[pricing/static] WARNING: Pricing data is ${daysOld} days old (policy: ${stalePolicy} days). ` +
        `Last updated: ${metadata.lastUpdated}. Consider updating or switching to dynamic pricing in Phase 3.`
      console.warn(message)
    }

    if (daysOld > 180) {
      throw new Error(
        `[pricing/static] CRITICAL: Pricing data is ${daysOld} days old and critically stale. ` +
        `Phase 3 must implement dynamic pricing (LiteLLM, API fetcher) before production use.`
      )
    }
  }
}
