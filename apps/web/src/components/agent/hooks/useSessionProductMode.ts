import { useMemo } from "react";
import { PRODUCT_MODES, type ProductMode } from "@repo/shared-types";
import { persistProductMode } from "../../../lib/product-mode-storage";

export function useSessionProductMode(sessionId: string) {
  const productMode = useMemo(
    () => loadStoredProductMode(sessionId),
    [sessionId],
  );

  persistProductMode(sessionId, normalizeProductMode(productMode));

  const setProductMode = (mode: ProductMode) => {
    persistProductMode(sessionId, normalizeProductMode(mode));
  };

  return {
    productMode: normalizeProductMode(productMode),
    setProductMode,
  };
}

function loadStoredProductMode(sessionId: string): ProductMode {
  try {
    const stored = localStorage.getItem(`productMode:${sessionId}`);
    if (stored && stored in PRODUCT_MODES) {
      return stored as ProductMode;
    }
  } catch {
    console.warn("[useSessionProductMode] Failed to load from localStorage");
  }
  return PRODUCT_MODES.AUTO;
}

function normalizeProductMode(mode: ProductMode): ProductMode {
  if (mode === PRODUCT_MODES.AUTO_FOR_SAME_REPO) {
    return PRODUCT_MODES.AUTO_FOR_SAME_REPO;
  }
  return mode;
}
