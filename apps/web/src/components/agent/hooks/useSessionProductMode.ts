import { useEffect, useState } from "react";
import { PRODUCT_MODES, type ProductMode } from "@repo/shared-types";
import {
  loadStoredProductMode,
  persistProductMode,
} from "../../../lib/product-mode-storage";

export function useSessionProductMode(sessionId: string) {
  const [productMode, setProductMode] = useState<ProductMode>(() =>
    loadStoredProductMode(sessionId),
  );

  useEffect(() => {
    const storedMode = loadStoredProductMode(sessionId);
    setProductMode((currentMode) =>
      currentMode === storedMode ? currentMode : storedMode,
    );
  }, [sessionId]);

  useEffect(() => {
    persistProductMode(sessionId, normalizeProductMode(productMode));
  }, [productMode, sessionId]);

  return {
    productMode: normalizeProductMode(productMode),
    setProductMode,
  };
}

function normalizeProductMode(mode: ProductMode): ProductMode {
  if (mode === PRODUCT_MODES.AUTO_FOR_SAME_REPO) {
    return PRODUCT_MODES.AUTO_FOR_SAME_REPO;
  }
  return mode;
}
