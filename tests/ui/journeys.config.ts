import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import base from "../../playwright.config";
export default defineConfig({
  ...base,
  testDir: resolve("tests/e2e"),
  use: { ...base.use, baseURL: process.env.UI_TEST_ORIGIN },
  webServer: undefined,
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: resolve("docs/implementation/flow-audit-e2e.json") },
    ],
  ],
});
