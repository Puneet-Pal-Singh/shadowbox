/**
 * Vitest Setup File
 * Provides necessary global APIs for browser-environment tests
 * (localStorage, sessionStorage, etc.)
 */

// Mock localStorage for Node.js test environment
class LocalStorageMock {
  private store: Record<string, string> = {};

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  key(index: number): string | null {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }

  get length(): number {
    return Object.keys(this.store).length;
  }
}

// Assign to global scope if not already present
if (typeof global.localStorage === "undefined") {
  Object.defineProperty(global, "localStorage", {
    value: new LocalStorageMock(),
    writable: true,
  });
}

if (typeof global.sessionStorage === "undefined") {
  Object.defineProperty(global, "sessionStorage", {
    value: new LocalStorageMock(),
    writable: true,
  });
}
