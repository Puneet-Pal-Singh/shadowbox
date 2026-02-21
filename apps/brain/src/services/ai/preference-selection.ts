import type { ProviderConfigService } from "../providers";
import type { ModelSelection } from "./ModelSelectionPolicy";

interface SelectionResolutionInput {
  providerId?: string;
  modelId?: string;
  providerConfigService?: ProviderConfigService;
  resolveSelection: (providerId?: string, modelId?: string) => ModelSelection;
}

interface PreferenceOverride {
  providerId: string;
  modelId: string;
}

export async function resolveSelectionWithPreferences(
  input: SelectionResolutionInput,
): Promise<ModelSelection> {
  if (input.providerId !== undefined || input.modelId !== undefined) {
    return input.resolveSelection(input.providerId, input.modelId);
  }

  const preferenceOverride = await readPreferenceOverride(
    input.providerConfigService,
  );
  if (!preferenceOverride) {
    return input.resolveSelection(undefined, undefined);
  }

  return input.resolveSelection(
    preferenceOverride.providerId,
    preferenceOverride.modelId,
  );
}

async function readPreferenceOverride(
  providerConfigService?: ProviderConfigService,
): Promise<PreferenceOverride | null> {
  if (!providerConfigService) {
    return null;
  }

  try {
    const preferences = await providerConfigService.getPreferences();
    if (!preferences.defaultProviderId || !preferences.defaultModelId) {
      return null;
    }
    return {
      providerId: preferences.defaultProviderId,
      modelId: preferences.defaultModelId,
    };
  } catch (error) {
    console.warn(
      "[ai/preferences] Failed to load BYOK preferences; using adapter defaults",
      error,
    );
    return null;
  }
}
