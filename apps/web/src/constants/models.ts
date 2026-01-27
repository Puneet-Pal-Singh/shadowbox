// apps/web/src/constants/models.ts

export const AI_MODELS = [
  { 
    id: 'llama-3', 
    name: 'Llama 3 (Free)', 
    provider: 'cloudflare',
    premium: false 
  },
  { 
    id: 'claude-3-5-sonnet', 
    name: 'Claude 3.5 Sonnet', 
    provider: 'anthropic', 
    premium: true 
  },
  { 
    id: 'claude-4.5-opus', 
    name: 'Claude 4.5 Opus', 
    provider: 'anthropic', 
    premium: true 
  },
  { 
    id: 'gpt-4o', 
    name: 'GPT-4o', 
    provider: 'openai', 
    premium: true 
  },
  { 
    id: 'qwen-3-max', 
    name: 'Qwen 3 Max', 
    provider: 'openai-compatible', 
    premium: false 
  }
] as const;

// Auto-generate the Union Type from the data above
// Result: 'llama-3' | 'claude-3-5-sonnet' | ...
export type ModelId = typeof AI_MODELS[number]['id'];

// Helper to get default
export const DEFAULT_MODEL: ModelId = 'llama-3';