/**
 * Model Picker Popover - Composer Integration
 *
 * Lightweight popover for selecting provider/model from chat composer.
 * Groups models by provider, supports search, and provides quick actions.
 *
 * Features:
 * - Provider-grouped model list with search
 * - Selected model indicator (checkmark)
 * - Quick action footer (Connect, Manage Models)
 * - Deterministic run-scoped selection via ProviderStore
 */

import React, { useMemo, useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Plus, Settings } from "lucide-react";
import { type ProviderRegistryEntry } from "@repo/shared-types";
import { type ProviderModelOption } from "../../services/api/providerClient.js";

/**
 * Flattened model for keyboard navigation
 */
interface FlatModel {
  providerId: string;
  model: ProviderModelOption;
}

/**
 * Props for ModelPickerPopover
 */
export interface ModelPickerPopoverProps {
  catalog: ProviderRegistryEntry[];
  providerModels: Record<string, ProviderModelOption[]>;
  visibleModelIds: Record<string, Set<string>>;
  selectedProviderId: string | null;
  selectedModelId: string | null;
  onSelectModel: (providerId: string, modelId: string) => Promise<void>;
  onConnectProvider: () => void;
  onManageModels: () => void;
  isLoading?: boolean;
}

/**
 * Internal representation of a grouped provider + models
 */
interface ProviderGroup {
  providerId: string;
  displayName: string;
  models: ProviderModelOption[];
}

/**
 * ModelPickerPopover Component
 */
export function ModelPickerPopover({
  catalog,
  providerModels,
  visibleModelIds,
  selectedProviderId,
  selectedModelId,
  onSelectModel,
  onConnectProvider,
  onManageModels,
  isLoading = false,
}: ModelPickerPopoverProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectingModelId, setSelectingModelId] = useState<string | null>(null);
  const [focusedModelIndex, setFocusedModelIndex] = useState<number>(-1);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modelButtonsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Build provider groups from catalog and models
  const providerGroups = useMemo((): ProviderGroup[] => {
    return catalog
      .map((entry) => ({
        providerId: entry.providerId,
        displayName: entry.displayName,
        models: providerModels[entry.providerId] || [],
      }))
      .filter((group) => group.models.length > 0);
  }, [catalog, providerModels]);

  // Filter groups and models based on search and visibility
  const filteredGroups = useMemo((): ProviderGroup[] => {
    const query = searchQuery.toLowerCase();
    const byVisibility = providerGroups.map((group) => {
      const visibleSet = visibleModelIds[group.providerId] || new Set();
      return {
        ...group,
        models: group.models.filter((model) => visibleSet.has(model.id)),
      };
    });

    if (!query.trim()) {
      return byVisibility.filter((group) => group.models.length > 0);
    }

    return byVisibility
      .map((group) => ({
        ...group,
        models: group.models.filter(
          (model) =>
            model.name.toLowerCase().includes(query) ||
            model.id.toLowerCase().includes(query) ||
            group.displayName.toLowerCase().includes(query)
        ),
      }))
      .filter((group) => group.models.length > 0);
  }, [providerGroups, searchQuery, visibleModelIds]);

  // Flatten filtered models for keyboard navigation
  const flatModels = useMemo((): FlatModel[] => {
    const result: FlatModel[] = [];
    for (const group of filteredGroups) {
      for (const model of group.models) {
        result.push({ providerId: group.providerId, model });
      }
    }
    return result;
  }, [filteredGroups]);

  // Get currently selected model label
  const selectedModelLabel = useMemo((): string => {
    if (!selectedProviderId || !selectedModelId) {
      return "Select Model";
    }

    const provider = catalog.find((p) => p.providerId === selectedProviderId);
    const model = providerModels[selectedProviderId]?.find(
      (m) => m.id === selectedModelId
    );

    if (!provider || !model) {
      return "Select Model";
    }

    return `${provider.displayName}: ${model.name}`;
  }, [selectedProviderId, selectedModelId, catalog, providerModels]);

  // Handle model selection
  const handleSelectModel = async (
    providerId: string,
    modelId: string
  ): Promise<void> => {
    setSelectingModelId(modelId);
    try {
      await onSelectModel(providerId, modelId);
      setIsOpen(false);
      setSearchQuery("");
    } finally {
      setSelectingModelId(null);
    }
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent): void => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
      setFocusedModelIndex(-1);
    }
  }, [isOpen]);

  // Handle keyboard navigation in search input
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        if (flatModels.length > 0) {
          const nextIndex = focusedModelIndex < flatModels.length - 1 ? focusedModelIndex + 1 : 0;
          const nextModel = flatModels[nextIndex];
          if (nextModel) {
            setFocusedModelIndex(nextIndex);
            modelButtonsRef.current.get(nextModel.model.id)?.focus();
          }
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (flatModels.length > 0) {
          const nextIndex = focusedModelIndex > 0 ? focusedModelIndex - 1 : flatModels.length - 1;
          const nextModel = flatModels[nextIndex];
          if (nextModel) {
            setFocusedModelIndex(nextIndex);
            modelButtonsRef.current.get(nextModel.model.id)?.focus();
          }
        }
        break;
    }
  };

  // Handle keyboard navigation in model buttons
  const handleModelKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    providerId: string,
    modelId: string
  ): void => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        void handleSelectModel(providerId, modelId);
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        if (focusedModelIndex < flatModels.length - 1) {
          const nextIndex = focusedModelIndex + 1;
          const nextModel = flatModels[nextIndex];
          if (nextModel) {
            setFocusedModelIndex(nextIndex);
            modelButtonsRef.current.get(nextModel.model.id)?.focus();
          }
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (focusedModelIndex > 0) {
          const nextIndex = focusedModelIndex - 1;
          const nextModel = flatModels[nextIndex];
          if (nextModel) {
            setFocusedModelIndex(nextIndex);
            modelButtonsRef.current.get(nextModel.model.id)?.focus();
          }
        } else {
          // Go back to search input
          setFocusedModelIndex(-1);
          searchInputRef.current?.focus();
        }
        break;
    }
  };

  return (
    <div ref={popoverRef} className="relative">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg
          text-sm font-medium transition-colors
          ${
            isLoading
              ? "bg-neutral-700 text-neutral-400 cursor-not-allowed"
              : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
          }
        `}
        aria-label="Open model picker"
      >
        <span className="truncate max-w-xs">{selectedModelLabel}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Popover Content */}
      {isOpen && (
        <div
          className={`
            absolute top-full right-0 mt-2 w-96 max-h-96
            bg-neutral-900 border border-neutral-700 rounded-lg
            shadow-lg shadow-black/50 z-50 flex flex-col
          `}
        >
          {/* Search Input */}
          <div className="p-3 border-b border-neutral-700">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search models or providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className={`
                  w-full pl-9 pr-3 py-2 rounded-md
                  bg-neutral-800 border border-neutral-700
                  text-sm text-neutral-100 placeholder-neutral-500
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                `}
                aria-label="Search models or providers"
              />
            </div>
          </div>

          {/* Provider Groups */}
          <div className="overflow-y-auto flex-1">
            {filteredGroups.length === 0 ? (
              <div className="p-4 text-center text-neutral-400 text-sm">
                {searchQuery
                  ? "No models match your search"
                  : "No providers connected. Click Connect below."}
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.providerId} className="border-b border-neutral-800 last:border-b-0">
                  {/* Provider Header */}
                  <div className="px-3 py-2 bg-neutral-800/50 sticky top-0">
                    <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                      {group.displayName}
                    </h3>
                  </div>

                  {/* Models */}
                  <div className="py-1">
                    {group.models.map((model) => (
                       <button
                         type="button"
                         key={model.id}
                         ref={(el) => {
                           if (el) modelButtonsRef.current.set(model.id, el);
                           else modelButtonsRef.current.delete(model.id);
                         }}
                         onClick={() => handleSelectModel(group.providerId, model.id)}
                         onKeyDown={(e) => handleModelKeyDown(e, group.providerId, model.id)}
                         disabled={selectingModelId === model.id}
                         className={`
                           w-full px-3 py-2 text-left text-sm flex items-center gap-2
                           transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500
                           ${
                             selectedProviderId === group.providerId &&
                             selectedModelId === model.id
                               ? "bg-blue-900/40 text-blue-100"
                               : "text-neutral-300 hover:bg-neutral-800/50"
                           }
                         `}
                         aria-selected={selectedProviderId === group.providerId && selectedModelId === model.id}
                       >
                        {/* Selection Indicator */}
                        <div
                          className={`
                            w-4 h-4 rounded border flex items-center justify-center shrink-0
                            ${
                              selectedProviderId === group.providerId &&
                              selectedModelId === model.id
                                ? "bg-blue-600 border-blue-600"
                                : "border-neutral-600"
                            }
                          `}
                        >
                          {selectedProviderId === group.providerId &&
                            selectedModelId === model.id && (
                              <span className="text-white text-xs">✓</span>
                            )}
                        </div>

                        {/* Model Info */}
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-medium">{model.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer Actions */}
          <div className="border-t border-neutral-700 p-2 bg-neutral-900/50 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onConnectProvider();
              }}
              className={`
                flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md
                text-xs font-medium transition-colors
                bg-blue-600 text-white hover:bg-blue-700
              `}
            >
              <Plus size={14} />
              Connect Provider
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onManageModels();
              }}
              className={`
                flex items-center justify-center gap-2 px-3 py-2 rounded-md
                text-xs font-medium transition-colors
                bg-neutral-700 text-neutral-200 hover:bg-neutral-600
              `}
              title="Manage model visibility"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
