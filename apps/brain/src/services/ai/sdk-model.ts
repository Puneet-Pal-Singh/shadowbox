import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { type SDKModelConfig } from "./SDKModelFactory";

export function createSDKModel(config: SDKModelConfig) {
  const { provider, apiKey, baseURL, model } = config;

  if (provider === "anthropic-native") {
    const client = createAnthropic({
      apiKey,
      baseURL,
    });
    return client(model);
  }

  const client = createOpenAI({
    baseURL,
    apiKey,
  });

  return client(model);
}
