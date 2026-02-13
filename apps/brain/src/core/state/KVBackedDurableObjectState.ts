import type {
  DurableObjectId,
  DurableObjectState,
  DurableObjectStorage,
  KVNamespace,
} from "@cloudflare/workers-types";
import { tagRuntimeStateSemantics } from "./StateSemantics";

interface KVListOptions {
  start?: string;
  end?: string;
  reverse?: boolean;
  limit?: number;
  prefix?: string;
  keysOnly?: boolean;
  readConcurrency?: number;
}

/**
 * Adapter that provides a DurableObjectState-like contract backed by KV.
 * This keeps runtime persistence durable without in-memory mock state.
 */
export function createKVBackedDurableObjectState(
  kv: KVNamespace,
  namespace: string,
): DurableObjectState {
  const keyPrefix = `run-engine:${namespace}:`;
  const maxReadConcurrency = 32;
  let warnedStorageTransaction = false;
  let warnedStorageBlockConcurrencyWhile = false;
  let warnedStateBlockConcurrencyWhile = false;

  const storage: DurableObjectStorage = {
    get: async <T>(key: string): Promise<T | undefined> => {
      const value = await kv.get(`${keyPrefix}${key}`, "json");
      return value === null ? undefined : (value as T);
    },
    put: async <T>(key: string, value: T): Promise<void> => {
      await kv.put(`${keyPrefix}${key}`, JSON.stringify(value));
    },
    delete: async (key: string): Promise<boolean> => {
      await kv.delete(`${keyPrefix}${key}`);
      return true;
    },
    list: async <T>(options?: KVListOptions): Promise<Map<string, T>> => {
      const listPrefix = `${keyPrefix}${options?.prefix ?? ""}`;
      const found = new Map<string, T>();
      let cursor: string | undefined;
      let consumed = 0;
      const limit = options?.limit ?? 1000;
      const keysOnly = options?.keysOnly ?? false;
      const readConcurrency = Math.max(
        1,
        Math.min(options?.readConcurrency ?? 8, maxReadConcurrency),
      );

      do {
        const page = await kv.list({ prefix: listPrefix, cursor });
        const valueReads: Array<{ storageKey: string; originalKey: string }> = [];
        for (const key of page.keys) {
          const originalKey = key.name.replace(keyPrefix, "");
          if (options?.start && originalKey < options.start) {
            continue;
          }
          // Durable Object storage.list uses an exclusive end boundary: [start, end).
          if (options?.end && originalKey >= options.end) {
            continue;
          }
          if (keysOnly) {
            found.set(originalKey, undefined as T);
            consumed += 1;
            if (consumed >= limit) {
              break;
            }
            continue;
          }
          valueReads.push({
            storageKey: key.name,
            originalKey,
          });
        }

        if (!keysOnly && valueReads.length > 0) {
          for (
            let batchStart = 0;
            batchStart < valueReads.length && consumed < limit;
            batchStart += readConcurrency
          ) {
            const batch = valueReads.slice(batchStart, batchStart + readConcurrency);
            const values = await Promise.all(
              batch.map((item) => kv.get(item.storageKey, "json")),
            );
            for (const [index, batchItem] of batch.entries()) {
              if (consumed >= limit) {
                break;
              }
              const value = values[index];
              if (value !== null) {
                found.set(batchItem.originalKey, value as T);
                consumed += 1;
              }
            }
          }
        }

        if (consumed >= limit || page.list_complete) {
          break;
        }
        cursor = page.cursor;
      } while (cursor);

      if (options?.reverse) {
        return new Map(Array.from(found.entries()).reverse());
      }
      return found;
    },
    /**
     * Warning: this is a passthrough for compatibility with DurableObjectStorage.
     * KV-backed storage cannot provide real atomic transaction semantics.
     */
    transaction: async <T>(
      closure: (txn: DurableObjectStorage) => Promise<T>,
    ): Promise<T> => {
      if (!warnedStorageTransaction) {
        console.warn(
          "[state/kv] storage.transaction is passthrough only with KV-backed state; atomic isolation is not provided",
        );
        warnedStorageTransaction = true;
      }
      return closure(storage);
    },
    /**
     * Warning: this is a passthrough for compatibility with DurableObjectStorage.
     * KV-backed storage cannot provide real lock-based exclusion semantics.
     */
    blockConcurrencyWhile: async <T>(closure: () => Promise<T>): Promise<T> => {
      if (!warnedStorageBlockConcurrencyWhile) {
        console.warn(
          "[state/kv] storage.blockConcurrencyWhile is passthrough only with KV-backed state; mutual exclusion is not provided",
        );
        warnedStorageBlockConcurrencyWhile = true;
      }
      return closure();
    },
  } as unknown as DurableObjectStorage;

  const state = {
    storage,
    id: { toString: () => `kv:${namespace}` } as DurableObjectId,
    waitUntil: async (promise: Promise<unknown>) => {
      await promise;
    },
    /**
     * Warning: this is a passthrough for API compatibility.
     * KV-backed state does not provide true Durable Object concurrency blocking.
     */
    blockConcurrencyWhile: async <T>(closure: () => Promise<T>): Promise<T> => {
      if (!warnedStateBlockConcurrencyWhile) {
        console.warn(
          "[state/kv] state.blockConcurrencyWhile is passthrough only with KV-backed state; mutual exclusion is not provided",
        );
        warnedStateBlockConcurrencyWhile = true;
      }
      return closure();
    },
  } as unknown as DurableObjectState;

  return tagRuntimeStateSemantics(state, "kv");
}
