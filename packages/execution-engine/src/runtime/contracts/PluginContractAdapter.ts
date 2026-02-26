// packages/execution-engine/src/runtime/contracts/PluginContractAdapter.ts
// SRP: Map task types to correct plugin/action contracts
// Ensures all agent -> plugin calls use correct discriminator values

import type { TaskType } from "../types.js";

export interface PluginActionContract {
  plugin: string;
  action: string;
}

export interface ContractMapping {
  [taskType: string]: PluginActionContract;
}

// Single source of truth for plugin/action mappings
const PLUGIN_CONTRACTS: ContractMapping = {
  analyze: { plugin: "filesystem", action: "read_file" },
  edit: { plugin: "filesystem", action: "write_file" },
  test: { plugin: "node", action: "run" },
  shell: { plugin: "node", action: "run" },
  git: { plugin: "git", action: "execute" },
  review: { plugin: "none", action: "none" }, // LLM task, not a plugin
};

/**
 * Get the correct plugin/action contract for a task type.
 * Single entry point to prevent future contract mismatches.
 */
export function getPluginContract(taskType: string): PluginActionContract {
  const contract = PLUGIN_CONTRACTS[taskType];
  if (!contract) {
    throw new Error(
      `[contracts] Unknown task type: "${taskType}". Supported: ${Object.keys(PLUGIN_CONTRACTS).join(", ")}`,
    );
  }
  return contract;
}

/**
 * Verify a plugin/action pair matches the expected contract.
 * Used for unit tests and runtime validation.
 */
export function verifyContract(
  taskType: string,
  plugin: string,
  action: string,
): boolean {
  const contract = PLUGIN_CONTRACTS[taskType];
  if (!contract) {
    return false;
  }
  return contract.plugin === plugin && contract.action === action;
}

/**
 * Get all registered task types for introspection/documentation.
 */
export function getRegisteredTaskTypes(): string[] {
  return Object.keys(PLUGIN_CONTRACTS).filter((t) => t !== "review");
}
