import { useCallback, useEffect, useState } from "react";
import type { ProductMode } from "@repo/shared-types";
import {
  loadStoredProductMode,
  persistProductMode,
} from "../../../lib/product-mode-storage";

export function useSessionProductMode(sessionId: string) {
  const [productMode, setProductModeState] = useState<ProductMode>(() =>
    loadStoredProductMode(sessionId),
  );

  useEffect(() => {
    setProductModeState(loadStoredProductMode(sessionId));
  }, [sessionId]);

  const setProductMode = useCallback(
    (mode: ProductMode) => {
      setProductModeState(mode);
      persistProductMode(sessionId, mode);
    },
    [sessionId],
  );

  return {
    productMode,
    setProductMode,
  };
}
