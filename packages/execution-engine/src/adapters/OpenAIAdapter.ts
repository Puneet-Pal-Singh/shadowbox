/**
 * OpenAI Model Adapter
 * Implements ModelProvider for OpenAI API
 */

import type { ModelProvider, ModelInput, ModelOutput, ModelToolCall, ToolDefinition } from './ModelProvider.js'

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

  private buildMessages(input: ModelInput): OpenAIMessage[] {
    return [
      {
        role: 'system',
        content: input.systemPrompt
      },
      {
        role: 'user',
        content: input.userMessage
      }
    ]
  }

  private buildTools(tools?: ToolDefinition[]) {
    if (!tools) return undefined

    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }))
  }

  private buildRequestBody(input: ModelInput, tools: unknown | undefined) {
    return {
      model: this.model,
      messages: this.buildMessages(input),
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 4096,
      tools,
      tool_choice: tools ? 'auto' : undefined
    }
  }

  private async callOpenAIAPI(requestBody: object): Promise<OpenAIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI API error: ${response.status} ${error}`)
    }

    return (await response.json()) as OpenAIResponse
  }

  private extractToolCalls(toolCalls: OpenAIToolCall[] | undefined): ModelToolCall[] {
    if (!toolCalls) return []

    const extracted: ModelToolCall[] = []
    for (const tc of toolCalls) {
      try {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
        extracted.push({
          id: tc.id,
          toolName: tc.function.name,
          arguments: args
        })
      } catch (error) {
        console.error('[openai/adapter] Failed to parse tool arguments:', error)
      }
    }
    return extracted
  }

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

  async generate(input: ModelInput): Promise<ModelOutput> {
    const tools = this.buildTools(input.tools)
    const requestBody = this.buildRequestBody(input, tools)
    const data = await this.callOpenAIAPI(requestBody)

    const choice = data.choices[0]
    if (!choice) {
      throw new Error('No response from OpenAI')
    }

    const toolCalls = this.extractToolCalls(choice.message.tool_calls)

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
