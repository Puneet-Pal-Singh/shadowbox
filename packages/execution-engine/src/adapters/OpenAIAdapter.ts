/**
 * OpenAI Model Adapter
 * Implements ModelProvider for OpenAI API
 */

import type { ModelProvider, ModelInput, ModelOutput, ModelToolCall } from './ModelProvider.js'

/**
 * OpenAI API response types (simplified)
 */
interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface OpenAIChoice {
  message: {
    content: string | null
    tool_calls?: OpenAIToolCall[]
  }
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter'
}

interface OpenAIResponse {
  choices: OpenAIChoice[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
  }
}

/**
 * Configuration for OpenAI adapter
 */
export interface OpenAIAdapterConfig {
  apiKey: string
  model?: string
  baseUrl?: string
}

/**
 * OpenAI model provider implementation
 */
export class OpenAIAdapter implements ModelProvider {
  private apiKey: string
  private model: string
  private baseUrl: string

  constructor(config: OpenAIAdapterConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required')
    }
    this.apiKey = config.apiKey
    this.model = config.model ?? 'gpt-4-turbo'
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1'
  }

  getName(): string {
    return `OpenAI (${this.model})`
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models/${this.model}`, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      })
      return response.ok
    } catch {
      return false
    }
  }

  async generate(input: ModelInput): Promise<ModelOutput> {
    const request = this.buildRequest(input)
    const response = await this.callAPI(request)
    return this.parseResponse(response)
  }

  /**
   * Build OpenAI API request (SRP: request formatting)
   */
  private buildRequest(input: ModelInput): {
    requestBody: Record<string, unknown>
    timeout: AbortSignal
  } {
    const messages: OpenAIMessage[] = [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userMessage }
    ]

    const tools = input.tools?.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    return {
      requestBody: {
        model: this.model,
        messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 4096,
        tools,
        tool_choice: tools ? 'auto' : undefined
      },
      timeout: controller.signal
    }
  }

  /**
   * Call OpenAI API (SRP: HTTP communication)
   */
  private async callAPI(request: { requestBody: Record<string, unknown>; timeout: AbortSignal }): Promise<OpenAIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request.requestBody),
      signal: request.timeout
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${response.status} ${error}`)
    }

    const data = (await response.json()) as unknown
    return this.validateResponse(data)
  }

  /**
   * Validate response structure (SRP: response validation)
   */
  private validateResponse(data: unknown): OpenAIResponse {
    if (!data || typeof data !== 'object' || !('choices' in data)) {
      throw new Error('Invalid OpenAI response structure')
    }

    const response = data as Record<string, unknown>
    const choices = response.choices as unknown[]

    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error('No choices in OpenAI response')
    }

    return data as OpenAIResponse
  }

  /**
   * Parse tool calls from response (SRP: tool call extraction)
   */
  private parseToolCalls(toolCalls: OpenAIToolCall[] | undefined): ModelToolCall[] {
    if (!toolCalls) {
      return []
    }

    const parsed: ModelToolCall[] = []

    for (const tc of toolCalls) {
      try {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
        parsed.push({
          id: tc.id,
          toolName: tc.function.name,
          arguments: args
        })
      } catch (error) {
        console.error('[openai/adapter] Failed to parse tool arguments for', tc.function.name, error)
        // Skip unparseable tool calls rather than silently dropping them
      }
    }

    return parsed
  }

  /**
   * Map OpenAI finish reason to standard reason (SRP: reason mapping)
   */
  private mapFinishReason(reason: string): 'max_tokens' | 'end_turn' | 'tool_use' | 'error' {
    switch (reason) {
      case 'length':
        return 'max_tokens'
      case 'tool_calls':
        return 'tool_use'
      case 'stop':
        return 'end_turn'
      default:
        return 'error'
    }
  }

  /**
   * Parse OpenAI response to ModelOutput (SRP: response parsing)
   */
  private parseResponse(data: OpenAIResponse): ModelOutput {
    const choice = data.choices[0]

    if (!choice) {
      throw new Error('No choice in OpenAI response')
    }

    const toolCalls = this.parseToolCalls(choice.message.tool_calls)

    return {
      content: choice.message.content ?? '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens
      },
      stopReason: this.mapFinishReason(choice.finish_reason)
    }
  }
}
