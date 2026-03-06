export interface ProviderBadgeProps {
  providerLabel: string;
  status: "connected" | "disconnected";
}

export interface ProviderBadgeViewModel {
  label: string;
  tone: "positive" | "neutral";
}

export function ProviderBadge(props: ProviderBadgeProps): ProviderBadgeViewModel {
  const tone = props.status === "connected" ? "positive" : "neutral";
  const label = `${props.providerLabel} (${props.status})`;
  return { label, tone };
}
