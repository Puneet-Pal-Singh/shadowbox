/**
 * Model adapters barrel export
 */

export type {
  ToolDefinition,
  ModelInput,
  ModelOutput,
  ModelToolCall,
  ModelProvider
} from './ModelProvider.js'

export {
  ToolDefinitionSchema,
  ModelInputSchema,
  ModelOutputSchema,
  ModelToolCallSchema,
  buildSystemPrompt,
  buildUserMessage
} from './ModelProvider.js'

export { OpenAIAdapter } from './OpenAIAdapter.js'
export type { OpenAIAdapterConfig } from './OpenAIAdapter.js'

export { LocalMockAdapter } from './LocalMockAdapter.js'
export type { LocalMockAdapterConfig } from './LocalMockAdapter.js'
