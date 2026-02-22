import type { BYOKValidationMode, ProviderId } from "@repo/shared-types";
import type { DurableProviderStore, ProviderAuditEvent } from "./DurableProviderStore";

export type ProviderAuditEventType =
  | "connect"
  | "validate"
  | "disconnect"
  | "preferences";

export type ProviderAuditStatus = "success" | "failure";

export interface ProviderAuditInput {
  eventType: ProviderAuditEventType;
  status: ProviderAuditStatus;
  providerId?: ProviderId;
  validationMode?: BYOKValidationMode;
  message?: string;
}

export class ProviderAuditService {
  constructor(private readonly durableStore: DurableProviderStore) {}

  async record(input: ProviderAuditInput): Promise<void> {
    const event: ProviderAuditEvent = {
      ...input,
      createdAt: new Date().toISOString(),
    };

    this.logAuditEvent(event);
    try {
      await this.durableStore.appendAuditEvent(event);
    } catch (error) {
      console.error(
        `[provider/audit] Failed to persist BYOK audit event for ${event.eventType}`,
        error,
      );
    }
  }

  private logAuditEvent(event: ProviderAuditEvent): void {
    const providerSegment = event.providerId ? ` provider=${event.providerId}` : "";
    const modeSegment = event.validationMode
      ? ` mode=${event.validationMode}`
      : "";
    const messageSegment = event.message ? ` message="${event.message}"` : "";
    console.log(
      `[provider/audit] event=${event.eventType} status=${event.status}${providerSegment}${modeSegment}${messageSegment}`,
    );
  }
}
