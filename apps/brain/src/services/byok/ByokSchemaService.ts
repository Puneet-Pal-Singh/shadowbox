/**
 * BYOK Schema Service
 *
 * Manages D1 database migrations for BYOK tables.
 * Ensures schema is ready before provider operations.
 */

import { ALL_BYOK_MIGRATIONS } from "./schema.js";

export interface IDatabase {
  prepare(sql: string): {
    bind(...params: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[] }>;
      first<T = unknown>(): Promise<T | undefined>;
      run(): Promise<{ success: boolean }>;
    };
    all<T = unknown>(): Promise<{ results: T[] }>;
    run(): Promise<{ success: boolean }>;
  };
}

interface MigrationRecord {
  migration_id: string;
  applied_at: string;
}

/**
 * ByokSchemaService
 *
 * Runs migrations idempotently - skips already-applied migrations.
 */
export class ByokSchemaService {
  constructor(private db: IDatabase) {}

  /**
   * Ensure database is ready for BYOK operations
   *
   * Runs any pending migrations and returns when ready.
   */
  async ensureReady(): Promise<void> {
    const migrations = this.getMigrations();
    const applied = await this.getAppliedMigrations();

    for (const migration of migrations) {
      if (!applied.has(migration.id)) {
        await this.applyMigration(migration);
      }
    }
  }

  /**
   * Get list of migrations to apply
   */
  private getMigrations(): Array<{ id: string; sql: string }> {
    return ALL_BYOK_MIGRATIONS.map((sql, index) => ({
      id: `byok_migration_${index.toString().padStart(3, "0")}`,
      sql,
    }));
  }

  /**
   * Get set of already-applied migration IDs
   */
  private async getAppliedMigrations(): Promise<Set<string>> {
    try {
      const stmt = this.db.prepare(
        "SELECT migration_id FROM byok_schema_migrations",
      );
      const result = await stmt.all<MigrationRecord>();
      return new Set(result.results.map((r) => r.migration_id));
    } catch {
      // Table doesn't exist yet - return empty set
      return new Set();
    }
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(migration: {
    id: string;
    sql: string;
  }): Promise<void> {
    console.log(`[byok/schema] Applying migration: ${migration.id}`);

    // Split SQL into individual statements
    const statements = this.splitSqlStatements(migration.sql);

    for (const sql of statements) {
      if (!sql.trim()) continue;

      const stmt = this.db.prepare(sql);
      const result = await stmt.run();

      if (!result.success) {
        throw new Error(`Migration ${migration.id} failed: ${sql}`);
      }
    }

    // Record successful migration
    const insertStmt = this.db
      .prepare(
        "INSERT INTO byok_schema_migrations (migration_id, applied_at) VALUES (?, ?)",
      )
      .bind(migration.id, new Date().toISOString());

    await insertStmt.run();

    console.log(`[byok/schema] Migration ${migration.id} applied successfully`);
  }

  /**
   * Split SQL into individual statements
   * Handles basic SQL parsing for migration scripts
   */
  private splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = "";
    let inString = false;
    let stringChar = "";

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];

      // Handle string literals
      if (!inString && (char === "'" || char === '"')) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar) {
        // Check for escaped quote
        if (sql[i + 1] === char) {
          current += char + char;
          i++;
        } else {
          inString = false;
        }
        continue;
      }

      // Statement separator
      if (!inString && char === ";") {
        if (current.trim()) {
          statements.push(current.trim());
        }
        current = "";
        continue;
      }

      current += char;
    }

    // Add remaining statement
    if (current.trim()) {
      statements.push(current.trim());
    }

    return statements;
  }
}

/**
 * Create a schema service instance from D1 database
 */
export function createByokSchemaService(d1: D1Database): ByokSchemaService {
  return new ByokSchemaService(wrapD1Database(d1));
}

/**
 * Wrap D1Database to match our IDatabase interface
 */
function wrapD1Database(d1: D1Database): IDatabase {
  return {
    prepare(sql: string) {
      const stmt = d1.prepare(sql);
      const bound = stmt.bind();
      return {
        bind(...params: unknown[]) {
          const boundStmt = stmt.bind(...params);
          return {
            async all<T = unknown>(): Promise<{ results: T[] }> {
              return (await boundStmt.all()) as { results: T[] };
            },
            async first<T = unknown>(): Promise<T | undefined> {
              return (await boundStmt.first()) as T | undefined;
            },
            async run(): Promise<{ success: boolean }> {
              return await boundStmt.run();
            },
          };
        },
        async all<T = unknown>(): Promise<{ results: T[] }> {
          return (await bound.all()) as { results: T[] };
        },
        async run(): Promise<{ success: boolean }> {
          return await bound.run();
        },
      };
    },
  };
}
