/**
 * @shadowbox/execution-engine
 * Deterministic execution engine for orchestrating agent tasks
 */

// Types
export * from './types/index.js'

// Core components
export * from './core/index.js'

// Adapters (model providers)
export { OpenAIAdapter, LocalMockAdapter } from './adapters/index.js'
export type { OpenAIAdapterConfig, LocalMockAdapterConfig } from './adapters/index.js'
export {
  ToolDefinitionSchema,
  ModelInputSchema,
  ModelOutputSchema,
  ModelToolCallSchema,
  buildSystemPrompt,
  buildUserMessage
} from './adapters/index.js'
export type { ToolDefinition, ModelInput, ModelOutput, ModelToolCall, ModelProvider } from './adapters/index.js'

// Output validation
export * from './output/index.js'

// Tools
export { Tool, ToolRegistry, ToolExecutor } from './tools/index.js'
export type { ToolDefinition as ToolDef, ToolExecutorConfig } from './tools/index.js'
export {
  validateFilePath,
  validateCommand,
  validateArguments,
  validateStringArg,
  validateNumberArg
} from './tools/index.js'

// Events
export { EventBus } from './events/index.js'
export type {
  ExecutionEvent,
  ExecutionStartedEvent,
  StepStartedEvent,
  ToolCalledEvent,
  ToolCompletedEvent,
  StepCompletedEvent,
  ExecutionCompletedEvent,
  ExecutionStoppedEvent,
  ExecutionFailedEvent,
  EventHandler
} from './events/index.js'

// Observability
export { ExecutionLogger, ExecutionTracer } from './observability/index.js'
export type { ExecutionSpan, ExecutionTimeline } from './observability/index.js'

// Artifacts
export { InMemoryArtifactStore, FileArtifactStore } from './artifacts/index.js'
export type { FileArtifactStoreConfig } from './artifacts/index.js'
export type { ArtifactStore } from './types/index.js'
