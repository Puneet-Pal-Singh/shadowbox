import type { ToolCategory } from "./context.js";

/**
 * Tool descriptor
 */
export interface ToolDescriptor {
  /** Tool name */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for parameters */
  schema: unknown;

  /** Required capabilities */
  requiredCapabilities?: string[];

  /** Tool category */
  category?: ToolCategory;

  /** Read-only flag */
  readOnly?: boolean;
}

/**
 * Tool registry type
 */
export type ToolRegistry = Map<string, ToolDescriptor>;
