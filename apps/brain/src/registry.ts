import { AnthropicProvider } from "./providers/anthropic";
import { CloudflareProvider } from "./providers/cloudflare";
import { OpenAIProvider } from "./providers/openai";

export const MODEL_REGISTRY = {
  // --- ANTHROPIC (The Coding Kings) ---
  "claude-4.5-opus": (id: string) => 
    new AnthropicProvider(id, "Claude 4.5 Opus", "claude-4-5-opus-20260201"),
  
  "claude-4.5-sonnet": (id: string) => 
    new AnthropicProvider(id, "Claude 4.5 Sonnet", "claude-4-5-sonnet-20251022"),

  // --- OPENAI (The Speed Kings) ---
  "gpt-5.2-codex": (id: string) => 
    new OpenAIProvider(id, "GPT-5.2 Codex", "gpt-5.2-codex-preview"),
  
  "gpt-5-turbo": (id: string) => 
    new OpenAIProvider(id, "GPT-5 Turbo", "gpt-5-turbo"),

  // --- OPEN SOURCE / CHINA (High Performance) ---
  // Using OpenAIProvider architecture as most OSS hostings are compatible
  "qwen-3-max": (id: string) => 
    new OpenAIProvider(id, "Qwen 3 Max (Thinking)", "qwen-3-max-instruct"),
    
  "kimi-k2.5": (id: string) => 
    new OpenAIProvider(id, "Kimi K2.5", "moonshot-v2.5-128k"),

  // --- FREE TIER (Cloudflare Native) ---
  "llama-3": (id: string, env: any) => 
    new CloudflareProvider(env)
};