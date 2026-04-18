import { useEffect, useMemo } from "react";
import type { ProviderModelOption } from "../../../services/api/providerClient";
import { isProviderVisibleModelHydrationPending } from "../../../lib/provider-model-bootstrap-loading";

interface UseSelectedProviderModelHydrationArgs {
  selectedProviderId: string | null;
  providerModels: Record<string, ProviderModelOption[]>;
  visibleModelIds: Record<string, Set<string>>;
  manageProviderModels: Record<string, ProviderModelOption[]>;
  loadingManageModelsForProviderIds?: Record<string, boolean>;
  loadManageProviderModels?: (providerId: string) => Promise<unknown>;
}

export function useSelectedProviderModelHydration({
  selectedProviderId,
  providerModels,
  visibleModelIds,
  manageProviderModels,
  loadingManageModelsForProviderIds,
  loadManageProviderModels,
}: UseSelectedProviderModelHydrationArgs) {
  const isSelectedProviderModelHydrationPending = useMemo(
    () =>
      isProviderVisibleModelHydrationPending({
        selectedProviderId,
        providerModels,
        visibleModelIds,
        manageProviderModels,
      }),
    [manageProviderModels, providerModels, selectedProviderId, visibleModelIds],
  );

  useEffect(() => {
    if (!selectedProviderId || !isSelectedProviderModelHydrationPending) {
      return;
    }
    if (loadingManageModelsForProviderIds?.[selectedProviderId]) {
      return;
    }
    if (!loadManageProviderModels) {
      return;
    }

    void loadManageProviderModels(selectedProviderId).catch((error) => {
      console.warn(
        "[agent-setup/model-picker] failed to hydrate selected visible models",
        error,
      );
    });
  }, [
    isSelectedProviderModelHydrationPending,
    loadManageProviderModels,
    loadingManageModelsForProviderIds,
    selectedProviderId,
  ]);

  return {
    isSelectedProviderModelHydrationPending,
  };
}
