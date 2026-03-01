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

import React, { useMemo, useState, useEffect, useRef } from "react";
import { Search, Eye, EyeOff } from "lucide-react";
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
  isLoading?: boolean;
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
  isLoading = false,
}: ManageModelsDialogProps): React.ReactElement | null {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Build provider groups with visibility state
  const providerGroups = useMemo(() => {
    return buildProviderGroups(catalog, providerModels, visibleModelIds);
  }, [catalog, providerModels, visibleModelIds]);

  // Filter groups and models based on search
  const filteredGroups = useMemo(() => {
    return filterProviderGroups(providerGroups, searchQuery);
  }, [providerGroups, searchQuery]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="presentation"
    >
      <div
        className="bg-white rounded-lg sm:rounded-lg shadow-lg w-full max-w-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-models-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      >
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <h2 id="manage-models-title" className="text-lg font-semibold">
            Manage Models
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="border-b px-6 py-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search models or providers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="p-6 text-center text-gray-500">Loading models...</div>
          ) : providerGroups.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No models available yet. Connect a provider and refresh models.
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No models match your search
            </div>
          ) : (
            <div className="space-y-6 p-6">
              {filteredGroups.map((group) => {
                 const visibleSet = visibleModelIds[group.providerId] || new Set();
                 const filteredModels = group.filteredModels;

                return (
                  <div key={group.providerId} className="space-y-3">
                    {/* Provider Header */}
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-sm text-gray-900">
                        {group.displayName}
                      </h3>
                      <span className="text-xs text-gray-500">
                        {visibleSet.size} / {group.totalCount} visible
                      </span>
                    </div>

                    {/* Models */}
                    <div className="space-y-2 pl-4 border-l-2 border-gray-200">
                      {filteredModels.map((model: ProviderModelOption) => {
                        const isVisible = visibleSet.has(model.id);
                        return (
                          <button
                            key={model.id}
                            onClick={() =>
                              onToggleModelVisibility(group.providerId, model.id)
                            }
                            type="button"
                            className="w-full flex items-center gap-3 p-2 rounded hover:bg-gray-100 transition-colors group"
                          >
                            <div
                              className={`flex items-center justify-center w-5 h-5 rounded border transition-colors ${
                                isVisible
                                  ? "bg-blue-600 border-blue-600"
                                  : "border-gray-300 group-hover:border-gray-400"
                              }`}
                            >
                              {isVisible ? (
                                <Eye size={14} className="text-white" />
                              ) : (
                                <EyeOff size={14} className="text-gray-400" />
                              )}
                            </div>
                            <div className="flex-1 text-left">
                              <p className="text-sm font-medium text-gray-900">
                                {model.name}
                              </p>
                              <p className="text-xs text-gray-500">{model.id}</p>
                            </div>
                          </button>
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
        <div className="border-t px-6 py-4 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
