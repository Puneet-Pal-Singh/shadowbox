/**
 * Preference Store Interface
 *
 * Focused interface for BYOK preferences.
 * Preferences are workspace-scoped (keyed by user_id + workspace_id).
 */

import type { BYOKPreferences, BYOKPreferencesPatch } from "@repo/shared-types";

export interface PreferenceStore {
  /**
   * Get preferences for a user + workspace
   */
  getPreferences(): Promise<BYOKPreferences>;

  /**
   * Update preferences (partial update)
   */
  updatePreferences(patch: BYOKPreferencesPatch): Promise<BYOKPreferences>;

  /**
   * Set a credential label for display purposes
   */
  setCredentialLabel(credentialId: string, label: string): Promise<void>;

  /**
   * Delete a credential label
   */
  deleteCredentialLabel(credentialId: string): Promise<void>;
}
