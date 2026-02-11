/**
 * Local Mock Model Adapter
 * For testing - returns deterministic responses without API calls
 */

import type { ModelProvider, ModelInput, ModelOutput, ModelToolCall } from './ModelProvider.js'

/**
 * Mock configuration
 */
export interface LocalMockAdapterConfig {
  /**
   * Response to return for all requests
   */
  responseContent?: string

  /**
   * Tool calls to return
   */
  toolCalls?: ModelToolCall[]

  /**
   * Token counts to report
   */
  inputTokens?: number
  outputTokens?: number

  /**
   * Stop reason
   */
  stopReason?: 'max_tokens' | 'end_turn' | 'tool_use' | 'error'

  /**
   * Delay in ms (for testing async behavior)
   */
  delayMs?: number
}

/**
 * Local mock model provider for testing
 */
export class LocalMockAdapter implements ModelProvider {
  private config: LocalMockAdapterConfig

  constructor(config: LocalMockAdapterConfig = {}) {
    this.config = {
      responseContent: 'Mock response',
      inputTokens: 100,
      outputTokens: 50,
      stopReason: 'end_turn',
      ...config
    }
  }

  getName(): string {
    return 'LocalMock'
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async generate(input: ModelInput): Promise<ModelOutput> {
    // Simulate delay if configured
    if (this.config.delayMs && this.config.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.config.delayMs))
    }

    // Return configured response
    return {
      content: this.config.responseContent ?? 'Mock response',
      toolCalls: this.config.toolCalls,
      usage: {
        inputTokens: this.config.inputTokens ?? 100,
        outputTokens: this.config.outputTokens ?? 50
      },
      stopReason: this.config.stopReason ?? 'end_turn'
    }
  }

  /**
   * Update response for next call (useful for test sequences)
   */
  setNextResponse(config: LocalMockAdapterConfig): void {
    this.config = {
      ...this.config,
      ...config
    }
  }
}
