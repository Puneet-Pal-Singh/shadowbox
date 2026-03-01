export type PopoverVerticalPlacement = "up" | "down";

export interface ResolvePopoverPlacementInput {
  triggerRect: DOMRect | null;
  viewportHeight: number;
  estimatedPopoverHeightPx: number;
  gapPx: number;
}

export function resolvePopoverPlacement({
  triggerRect,
  viewportHeight,
  estimatedPopoverHeightPx,
  gapPx,
}: ResolvePopoverPlacementInput): PopoverVerticalPlacement {
  if (!triggerRect) {
    return "down";
  }

  const spaceBelow = viewportHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  const requiredHeight = estimatedPopoverHeightPx + gapPx;

  if (spaceBelow < requiredHeight && spaceAbove > spaceBelow) {
    return "up";
  }

  return "down";
}
