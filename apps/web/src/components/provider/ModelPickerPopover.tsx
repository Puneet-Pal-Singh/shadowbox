/**
 * Model Picker Popover - Composer Integration
 *
 * Lightweight popover for selecting provider/model from chat composer.
 * Groups models by provider, supports search, and provides quick actions.
 *
 * Features:
 * - Provider-grouped model list with search
 * - Selected model indicator (checkmark)
 * - Compact quick actions beside search (Connect, Manage Models)
 * - Deterministic run-scoped selection via ProviderStore
 */

import React, { useMemo, useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Plus, Settings } from "lucide-react";
import { type ProviderRegistryEntry } from "@repo/shared-types";
import { type ProviderModelOption } from "../../services/api/providerClient.js";

const VIEWPORT_PADDING_PX = 12;
const POPOVER_GAP_PX = 8;
const ESTIMATED_POPOVER_HEIGHT_PX = 420;
const PREFERRED_POPOVER_WIDTH_PX = 352;
const MIN_POPOVER_WIDTH_PX = 280;

interface PopoverPlacement {
  vertical: "up" | "down";
  horizontal: "start" | "end";
  widthPx: number;
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
  const [placement, setPlacement] = useState<PopoverPlacement>({
    vertical: "down",
    horizontal: "start",
    widthPx: PREFERRED_POPOVER_WIDTH_PX,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectingModelId, setSelectingModelId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    }
  }, [isOpen]);

  const resolvePlacement = (): PopoverPlacement => {
    const triggerRect = triggerButtonRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      return {
        vertical: "down",
        horizontal: "start",
        widthPx: PREFERRED_POPOVER_WIDTH_PX,
      };
    }

    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const requiredHeight = ESTIMATED_POPOVER_HEIGHT_PX + POPOVER_GAP_PX;
    const vertical: "up" | "down" =
      spaceBelow < requiredHeight && spaceAbove > spaceBelow ? "up" : "down";

    const spaceRight = window.innerWidth - triggerRect.left - VIEWPORT_PADDING_PX;
    const spaceLeft = triggerRect.right - VIEWPORT_PADDING_PX;
    const horizontal: "start" | "end" =
      spaceRight < PREFERRED_POPOVER_WIDTH_PX && spaceLeft > spaceRight
        ? "end"
        : "start";

    const availableWidth = horizontal === "start" ? spaceRight : spaceLeft;
    const widthPx = Math.max(
      MIN_POPOVER_WIDTH_PX,
      Math.min(PREFERRED_POPOVER_WIDTH_PX, Math.floor(availableWidth))
    );

    return {
      vertical,
      horizontal,
      widthPx,
    };
  };

  const handleToggle = (): void => {
    if (isLoading) {
      return;
    }
    if (!isOpen) {
      setPlacement(resolvePlacement());
    }
    setIsOpen((current) => !current);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleViewportChange = (): void => {
      setPlacement(resolvePlacement());
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen]);

  return (
    <div ref={popoverRef} className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className={`
          inline-flex h-9 max-w-[min(18rem,calc(100vw-6rem))] items-center gap-2 rounded-md
          border border-neutral-700/70 bg-transparent px-3 text-sm font-medium text-neutral-300
          transition-colors hover:bg-neutral-800/60 hover:text-neutral-100
          focus:outline-none focus:ring-2 focus:ring-blue-500
          disabled:cursor-not-allowed disabled:opacity-50
        `}
        aria-label="Open model picker"
        aria-expanded={isOpen}
        title={selectedModelLabel}
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
          data-testid="model-picker-popover"
          className={`
            absolute z-50 flex max-h-[22rem] flex-col overflow-hidden rounded-xl
            border border-neutral-700/80 bg-neutral-900/95 shadow-2xl backdrop-blur
            ${placement.vertical === "down" ? "top-full mt-2" : "bottom-full mb-2"}
            ${placement.horizontal === "start" ? "left-0" : "right-0"}
          `}
          style={{
            width: `${placement.widthPx}px`,
            maxWidth: `calc(100vw - ${VIEWPORT_PADDING_PX * 2}px)`,
          }}
        >
          {/* Search + Actions */}
          <div className="flex items-center gap-2 border-b border-neutral-800 p-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-2.5 text-neutral-500" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search models or providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`
                  h-9 w-full rounded-md
                  bg-neutral-800 border border-neutral-700
                  pl-9 pr-3 text-sm text-neutral-100 placeholder-neutral-500
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                `}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onConnectProvider();
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
              aria-label="Connect provider"
              title="Connect provider"
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onManageModels();
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
              aria-label="Manage model visibility"
              title="Manage model visibility"
            >
              <Settings size={14} />
            </button>
          </div>

          {/* Provider Groups */}
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="p-6 text-center text-neutral-400 text-sm">
                Loading models...
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-6 text-center text-neutral-400 text-sm">
                {searchQuery
                  ? "No models match your search"
                  : "No providers connected yet."}
              </div>
            ) : (
              filteredGroups.map((group) => (
                <div
                  key={group.providerId}
                  className="border-b border-neutral-800/80 last:border-b-0"
                >
                  {/* Provider Header */}
                  <div className="sticky top-0 bg-neutral-900/95 px-3 py-2">
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
                         onClick={() => handleSelectModel(group.providerId, model.id)}
                         disabled={selectingModelId === model.id}
                         className={`
                           w-full px-3 py-2.5 text-left text-sm
                           transition-colors disabled:opacity-50
                           ${
                             selectedProviderId === group.providerId &&
                             selectedModelId === model.id
                               ? "bg-neutral-800 text-neutral-100"
                               : "text-neutral-300 hover:bg-neutral-800/50"
                           }
                         `}
                         title={`${model.name} (${model.id})`}
                       >
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate font-medium">{model.name}</p>
                          {selectedProviderId === group.providerId &&
                            selectedModelId === model.id && (
                              <span className="ml-auto text-neutral-200">✓</span>
                            )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
