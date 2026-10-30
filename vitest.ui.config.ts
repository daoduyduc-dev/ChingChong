import "./server/env.mjs";
import { defineConfig } from "vitest/config";
const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
  !database.pathname.endsWith("_test")
)
  throw Error(
    "UI tests require an isolated local _test database; use npm run test:ui",
  );
export default defineConfig({
  test: {
    include: ["tests/ui/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
