/**
 * D1 Preference Store
 *
 * D1-backed implementation of PreferenceStore.
 * Preferences are workspace-scoped (keyed by user_id + workspace_id).
 */

import type { D1Database } from "@cloudflare/workers-types";
import type { BYOKPreferences, BYOKPreferencesPatch } from "@repo/shared-types";
import type { PreferenceStore } from "./PreferenceStore";
import { AXIS_PROVIDER_ID } from "../axis";
import { AXIS_CURATED_MODEL_IDS } from "../axis";

const AXIS_DEFAULT_MODEL_ID = AXIS_CURATED_MODEL_IDS[0];

interface PreferenceRow {
  user_id: string;
  workspace_id: string;
  default_provider_id: string | null;
  default_credential_id: string | null;
  default_model_id: string | null;
  fallback_mode: string;
  fallback_json: string | null;
  visible_model_ids_json: string | null;
  updated_at: string;
}

/**
 * D1PreferenceStore
 *
 * Workspace-scoped preference storage.
 */
export class D1PreferenceStore implements PreferenceStore {
  constructor(
    private db: D1Database,
    private userId: string,
    private workspaceId: string,
  ) {}

  async getPreferences(): Promise<BYOKPreferences> {
    const query = `
      SELECT * FROM byok_preferences
      WHERE user_id = ? AND workspace_id = ?
    `;

    const stmt = this.db.prepare(query).bind(this.userId, this.workspaceId);
    const row = await stmt.first<PreferenceRow>();

    if (!row) {
      return this.createDefaultPreferences();
    }

    return this.rowToPreferences(row);
  }

  async updatePreferences(
    patch: BYOKPreferencesPatch,
  ): Promise<BYOKPreferences> {
    const current = await this.getPreferences();
    const now = new Date().toISOString();

    const merged: BYOKPreferences = {
      defaultProviderId: patch.defaultProviderId ?? current.defaultProviderId,
      defaultModelId: patch.defaultModelId ?? current.defaultModelId,
      visibleModelIds: current.visibleModelIds,
      updatedAt: now,
    };

    // Use upsert pattern
    const query = `
      INSERT INTO byok_preferences (
        user_id, workspace_id, default_provider_id, default_model_id,
        fallback_mode, fallback_json, visible_model_ids_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, workspace_id)
      DO UPDATE SET
        default_provider_id = COALESCE(excluded.default_provider_id, byok_preferences.default_provider_id),
        default_model_id = COALESCE(excluded.default_model_id, byok_preferences.default_model_id),
        updated_at = excluded.updated_at
    `;

    const stmt = this.db
      .prepare(query)
      .bind(
        this.userId,
        this.workspaceId,
        merged.defaultProviderId ?? AXIS_PROVIDER_ID,
        merged.defaultModelId ?? AXIS_DEFAULT_MODEL_ID,
        "strict",
        null,
        merged.visibleModelIds ? JSON.stringify(merged.visibleModelIds) : "{}",
        now,
      );

    const result = await stmt.run();
    if (!result.success) {
      throw new Error("Failed to update preferences");
    }

    return merged;
  }

  private createDefaultPreferences(): BYOKPreferences {
    return {
      defaultProviderId: AXIS_PROVIDER_ID,
      defaultModelId: AXIS_DEFAULT_MODEL_ID,
      visibleModelIds: {},
      updatedAt: new Date().toISOString(),
    };
  }

  private rowToPreferences(row: PreferenceRow): BYOKPreferences {
    let visibleModelIds: Record<string, string[]> = {};
    if (row.visible_model_ids_json) {
      try {
        visibleModelIds = JSON.parse(row.visible_model_ids_json);
      } catch {
        visibleModelIds = {};
      }
    }

    return {
      defaultProviderId:
        (row.default_provider_id as string | undefined) ?? AXIS_PROVIDER_ID,
      defaultModelId: row.default_model_id ?? AXIS_DEFAULT_MODEL_ID,
      visibleModelIds,
      updatedAt: row.updated_at,
    };
  }
}
