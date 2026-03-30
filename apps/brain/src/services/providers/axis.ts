import type {
  BYOKDiscoveredProviderModel,
  ModelDescriptor,
} from "@repo/shared-types";

export const AXIS_PROVIDER_ID = "axis";
export const AXIS_DAILY_LIMIT = 50000;

export const AXIS_CURATED_MODEL_IDS = [
  "z-ai/glm-4.5-air:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "arcee-ai/trinity-large-preview:free",
  "stepfun/step-3.5-flash:free",
  "qwen/qwen3.6-plus-preview:free",
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
