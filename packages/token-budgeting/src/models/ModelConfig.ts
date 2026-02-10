/**
 * ModelConfig - Predefined model configurations
 *
 * Source: Official model documentation
 * https://platform.openai.com/docs/models
 * https://docs.anthropic.com/en/docs/about-claude/models/latest
 */
import type { ModelConfig } from "../types.js";

/**
 * Get model configuration by ID
 * @param modelId - Model identifier (e.g., "gpt-4-turbo")
 * @returns Model configuration
 * @throws Error if model not found
 */
export function getModelConfig(modelId: string): ModelConfig {
  const models = getBuiltinModels();
  const model = models.find((m) => m.id === modelId);
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }
  return model;
}

/**
 * Get all builtin model configurations
 * Token limits sourced from official model documentation
 */
export function getBuiltinModels(): ModelConfig[] {
  return [
    // OpenAI GPT-4 models
    {
      id: "gpt-4-turbo",
      name: "GPT-4 Turbo",
      maxTokens: 128000,
      supportedMethods: ["chat"],
    },
    {
      id: "gpt-4",
      name: "GPT-4",
      maxTokens: 8192,
      supportedMethods: ["chat"],
    },
    {
      id: "gpt-3.5-turbo",
      name: "GPT-3.5 Turbo",
      maxTokens: 4096,
      supportedMethods: ["chat"],
    },

    // Anthropic Claude models (latest versions)
    {
      id: "claude-3-5-sonnet",
      name: "Claude 3.5 Sonnet",
      maxTokens: 200000,
      supportedMethods: ["chat"],
    },
    {
      id: "claude-3-opus",
      name: "Claude 3 Opus",
      maxTokens: 200000,
      supportedMethods: ["chat"],
    },
    {
      id: "claude-3-sonnet",
      name: "Claude 3 Sonnet",
      maxTokens: 200000,
      supportedMethods: ["chat"],
    },
    {
      id: "claude-3-haiku",
      name: "Claude 3 Haiku",
      maxTokens: 200000,
      supportedMethods: ["chat"],
    },
  ];
}

/**
 * Create custom model config
 * @param id - Model identifier
 * @param name - Human-readable name
 * @param maxTokens - Maximum tokens supported
 * @returns Custom model config
 */
export function createCustomModel(
  id: string,
  name: string,
  maxTokens: number,
): ModelConfig {
  return {
    id,
    name,
    maxTokens,
    supportedMethods: ["chat"],
  };
}
