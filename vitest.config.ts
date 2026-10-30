import "./server/env.mjs";
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/ui/**"],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
