/**
 * D1 Audit Service
 *
 * D1-backed implementation for append-only audit logging.
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { BYOKValidationMode, ProviderId } from "@repo/shared-types";
import type {
  ProviderAuditLog,
  ProviderAuditEvent as StoreAuditEvent,
} from "./stores/ProviderAuditLog";

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

export class D1AuditService implements ProviderAuditLog {
  constructor(
    private db: D1Database,
    private userId: string,
    private workspaceId: string,
  ) {}

  async appendAuditEvent(event: StoreAuditEvent): Promise<void> {
    const eventId = crypto.randomUUID();
    const query = `
      INSERT INTO byok_audit_events (
        event_id, user_id, workspace_id, provider_id, credential_id,
        operation, status, error_code, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const stmt = this.db
      .prepare(query)
      .bind(
        eventId,
        this.userId,
        this.workspaceId,
        event.providerId || null,
        event.credentialId || null,
        event.eventType,
        event.status,
        event.message || null,
        event.metadataJson || null,
        new Date().toISOString(),
      );

    await stmt.run();
  }

  async record(input: ProviderAuditInput): Promise<void> {
    const event: StoreAuditEvent = {
      eventType: input.eventType as StoreAuditEvent["eventType"],
      status: input.status as StoreAuditEvent["status"],
      providerId: input.providerId,
      validationMode: input.validationMode,
      message: input.message,
    };

    this.logAuditEvent(input);
    try {
      await this.appendAuditEvent(event);
    } catch (error) {
      console.error(
        `[provider/audit] Failed to persist BYOK audit event for ${event.eventType}`,
        error,
      );
    }
  }

  private logAuditEvent(event: ProviderAuditInput): void {
    const providerSegment = event.providerId
      ? ` provider=${event.providerId}`
      : "";
    const modeSegment = event.validationMode
      ? ` mode=${event.validationMode}`
      : "";
    const messageSegment = event.message ? ` message="${event.message}"` : "";
    console.log(
      `[provider/audit] event=${event.eventType} status=${event.status}${providerSegment}${modeSegment}${messageSegment}`,
    );
  }
}
