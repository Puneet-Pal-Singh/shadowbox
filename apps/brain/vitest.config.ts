import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@repo/shared-types": path.resolve(
        __dirname,
        "../../packages/shared-types/src/index.ts",
      ),
      "@shadowbox/execution-engine/runtime": path.resolve(
        __dirname,
        "../../packages/execution-engine/src/runtime/index.ts",
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
