import type {
  BYOKDiscoveredProviderModel,
  ModelDescriptor,
} from "@repo/shared-types";

export const AXIS_PROVIDER_ID = "axis";
export const AXIS_DAILY_LIMIT = 5;

export const AXIS_CURATED_MODEL_IDS = [
  "openai/gpt-oss-120b:free",
  "z-ai/glm-4.5-air:free",
  "arcee-ai/trinity-large-preview:free",
  "stepfun/step-3.5-flash:free",
] as const;

export function getAxisCatalogModels(): ModelDescriptor[] {
  return AXIS_CURATED_MODEL_IDS.map((modelId) => ({
    id: modelId,
    name: modelId,
    provider: AXIS_PROVIDER_ID,
  }));
}

export function getAxisDiscoveredModels(): BYOKDiscoveredProviderModel[] {
  return AXIS_CURATED_MODEL_IDS.map((modelId) => ({
    id: modelId,
    name: modelId,
    providerId: AXIS_PROVIDER_ID,
  }));
}

