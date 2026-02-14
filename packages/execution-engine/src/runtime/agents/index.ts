// apps/brain/src/core/agents/index.ts
// Phase 3D: Agents module barrel exports

export { BaseAgent } from "./BaseAgent.js";
export type {
  AgentCapability,
  ExecutionContext,
  IAgent,
  PlanContext,
  SynthesisContext,
} from "./BaseAgent.js";
export {
  CodingAgent,
  UnsupportedTaskTypeError,
  TaskInputError,
} from "./CodingAgent.js";
export { ReviewAgent } from "./ReviewAgent.js";
export { AgentRegistry, AgentNotFoundError } from "./AgentRegistry.js";
export {
  validateSafePath,
  extractStructuredField,
  PathValidationError,
} from "./validation.js";
