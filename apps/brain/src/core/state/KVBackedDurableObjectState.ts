import type {
  DurableObjectId,
  DurableObjectState,
  DurableObjectStorage,
  KVNamespace,
} from "@cloudflare/workers-types";

interface KVListOptions {
  start?: string;
  end?: string;
  reverse?: boolean;
  limit?: number;
  prefix?: string;
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

      do {
        const page = await kv.list({ prefix: listPrefix, cursor });
        for (const key of page.keys) {
          const originalKey = key.name.replace(keyPrefix, "");
          if (options?.start && originalKey < options.start) {
            continue;
          }
          if (options?.end && originalKey > options.end) {
            continue;
          }
          const value = await kv.get(key.name, "json");
          if (value !== null) {
            found.set(originalKey, value as T);
            consumed += 1;
            if (consumed >= limit) {
              break;
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
    transaction: async <T>(
      closure: (txn: DurableObjectStorage) => Promise<T>,
    ): Promise<T> => {
      return closure(storage);
    },
    blockConcurrencyWhile: async <T>(closure: () => Promise<T>): Promise<T> => {
      return closure();
    },
  } as unknown as DurableObjectStorage;

  return {
    storage,
    id: { toString: () => `kv:${namespace}` } as DurableObjectId,
    waitUntil: async (promise: Promise<unknown>) => {
      await promise;
    },
    blockConcurrencyWhile: async <T>(closure: () => Promise<T>): Promise<T> => {
      return closure();
    },
  } as unknown as DurableObjectState;
}
