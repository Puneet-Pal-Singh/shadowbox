/**
 * Manage Models Dialog - Model Visibility Curation
 *
 * Allows users to curate which models appear in the composer picker by
 * enabling/disabling models per provider.
 *
 * Features:
 * - Group models by provider
 * - Toggle visibility per model
 * - Search/filter models
 * - Show count of visible vs total models
 * - Preserve current selection validity
 */

import React, { useMemo, useState } from "react";
import { Search, Plus } from "lucide-react";
import { type ProviderRegistryEntry } from "@repo/shared-types";
import { type ProviderModelOption } from "../../services/api/providerClient.js";

/**
 * Provider group with visibility state
 */
interface ProviderGroup {
  providerId: string;
  displayName: string;
  models: ProviderModelOption[];
  visibleCount: number;
  totalCount: number;
}

/**
 * Provider group with filtered models
 */
interface FilteredProviderGroup extends ProviderGroup {
  filteredModels: ProviderModelOption[];
}

/**
 * Build provider groups from catalog, models, and visibility state
 */
function buildProviderGroups(
  catalog: ProviderRegistryEntry[],
  providerModels: Record<string, ProviderModelOption[]>,
  visibleModelIds: Record<string, Set<string>>
): ProviderGroup[] {
  return catalog
    .map((entry) => {
      const models = providerModels[entry.providerId] || [];
      const visibleSet = visibleModelIds[entry.providerId] || new Set();
      return {
        providerId: entry.providerId,
        displayName: entry.displayName,
        models,
        visibleCount: visibleSet.size,
        totalCount: models.length,
      };
    })
    .filter((group) => group.models.length > 0);
}

/**
 * Filter provider groups and models based on search query
 */
function filterProviderGroups(
  providerGroups: ProviderGroup[],
  searchQuery: string
): FilteredProviderGroup[] {
  if (!searchQuery.trim()) {
    return providerGroups.map((group) => ({
      ...group,
      filteredModels: group.models,
    }));
  }

  const query = searchQuery.toLowerCase();
  return providerGroups
    .map((group) => ({
      ...group,
      filteredModels: group.models.filter(
        (model) =>
          model.name.toLowerCase().includes(query) ||
          model.id.toLowerCase().includes(query) ||
          group.displayName.toLowerCase().includes(query)
      ),
    }))
    .filter((group) => group.filteredModels.length > 0);
}

/**
 * Props for ManageModelsDialog
 */
export interface ManageModelsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: ProviderRegistryEntry[];
  providerModels: Record<string, ProviderModelOption[]>;
  visibleModelIds: Record<string, Set<string>>;
  onToggleModelVisibility: (providerId: string, modelId: string) => void;
  onConnectProvider?: () => void;
}

/**
 * ManageModelsDialog Component
 */
export function ManageModelsDialog({
  isOpen,
  onClose,
  catalog,
  providerModels,
  visibleModelIds,
  onToggleModelVisibility,
  onConnectProvider,
}: ManageModelsDialogProps): React.ReactElement | null {
  const [searchQuery, setSearchQuery] = useState("");

  // Build provider groups with visibility state
  const providerGroups = useMemo(() => {
    return buildProviderGroups(catalog, providerModels, visibleModelIds);
  }, [catalog, providerModels, visibleModelIds]);

  // Filter groups and models based on search
  const filteredGroups = useMemo(() => {
    return filterProviderGroups(providerGroups, searchQuery);
  }, [providerGroups, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      role="presentation"
    >
      <div
        className="flex w-full max-w-2xl max-h-[82vh] flex-col overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-models-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-neutral-700 px-6 py-4">
          <div className="space-y-1">
            <h2 id="manage-models-title" className="text-[1.65rem] font-semibold tracking-tight">
              Manage models
            </h2>
            <p className="text-sm text-neutral-400">
              Customize which models appear in the model selector.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onConnectProvider && (
              <button
                onClick={onConnectProvider}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 transition hover:bg-neutral-800"
                type="button"
              >
                <Plus size={14} />
                Connect provider
              </button>
            )}
            <button
              onClick={onClose}
              className="text-neutral-500 transition hover:text-neutral-300"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
            <input
              type="text"
              placeholder="Search models"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-md border border-neutral-700 bg-neutral-800/80 pl-9 pr-3 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 pb-4">
          {filteredGroups.length === 0 ? (
            <div className="py-8 text-center text-neutral-500">
              {searchQuery ? "No models match your search" : "No providers connected"}
            </div>
          ) : (
            <div className="space-y-5">
              {filteredGroups.map((group) => {
                 const visibleSet = visibleModelIds[group.providerId] || new Set();
                 const filteredModels = group.filteredModels;

                return (
                  <div key={group.providerId} className="space-y-2.5">
                    {/* Provider Header */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-[1.1rem] font-medium text-neutral-300">
                        {group.displayName}
                      </h3>
                      <span className="text-xs text-neutral-500">
                        {visibleSet.size} / {group.totalCount} visible
                      </span>
                    </div>

                    {/* Models */}
                    <div className="space-y-1">
                      {filteredModels.map((model: ProviderModelOption) => {
                        const isVisible = visibleSet.has(model.id);
                        return (
                          <div
                            key={model.id}
                            className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-800/60"
                          >
                            <div className="flex-1 text-left">
                              <p className="text-sm font-medium text-neutral-100">
                                {model.name}
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isVisible}
                              aria-label={`${model.name} visibility`}
                              onClick={() =>
                                onToggleModelVisibility(group.providerId, model.id)
                              }
                              className={`relative inline-flex h-5 w-8 items-center rounded-full border transition ${
                                isVisible
                                  ? "border-blue-500 bg-blue-600"
                                  : "border-neutral-600 bg-neutral-800"
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
                                  isVisible ? "translate-x-4" : "translate-x-0.5"
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-neutral-700 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:bg-neutral-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
