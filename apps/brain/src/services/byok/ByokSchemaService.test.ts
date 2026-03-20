import { afterEach, describe, expect, it } from "vitest";
import {
  createByokSchemaService,
  resetByokSchemaReadyCacheForTests,
} from "./ByokSchemaService.js";
import { createTestByokD1Database } from "../../test-utils/byokTestD1";

describe("ByokSchemaService", () => {
  afterEach(() => {
    resetByokSchemaReadyCacheForTests();
  });

  it("applies migrations once and provisions every required table", async () => {
    const db = createTestByokD1Database();
    const service = createByokSchemaService(db.database);

    await service.ensureReady();

    const appliedMigrations = db.inspect.getAppliedMigrationIds();
    expect(appliedMigrations.length).toBeGreaterThan(0);
    expect(appliedMigrations).toContain("byok_migration_000");
    expect(appliedMigrations).toContain("byok_migration_005");
  });

  it("skips already-applied migrations on subsequent ensureReady calls", async () => {
    const db = createTestByokD1Database();
    const service = createByokSchemaService(db.database);

    await service.ensureReady();
    const firstPass = db.inspect.getAppliedMigrationIds();

    await service.ensureReady();
    const secondPass = db.inspect.getAppliedMigrationIds();

    expect(secondPass).toEqual(firstPass);
  });

  it("treats pre-existing add-column targets as already satisfied", async () => {
    const db = createTestByokD1Database();
    db.inspect.seedTable("byok_preferences", [
      "user_id",
      "workspace_id",
      "default_provider_id",
      "default_credential_id",
      "default_model_id",
      "fallback_mode",
      "fallback_json",
      "updated_at",
      "visible_model_ids_json",
      "credential_labels_json",
    ]);
    db.inspect.seedTable("provider_registry_cache", [
      "provider_id",
      "display_name",
      "auth_modes_json",
      "capabilities_json",
      "models_json",
      "source_version",
      "fetched_at",
      "expires_at",
      "refreshed_at",
    ]);

    const service = createByokSchemaService(db.database);

    await expect(service.ensureReady()).resolves.toBeUndefined();
    expect(db.inspect.getAppliedMigrationIds().length).toBeGreaterThan(0);
  });
});
