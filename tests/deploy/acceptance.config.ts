import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";
import { resolve } from "node:path";
export default defineConfig({
  ...base,
  testDir: resolve("tests/e2e"),
  outputDir: resolve("test-results/deployment-acceptance"),
  use: {
    ...base.use,
    baseURL: process.env.DEPLOY_ORIGIN ?? "http://127.0.0.1:5180",
  },
  webServer: undefined,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: resolve(
          process.env.DEPLOY_REPORT_FILE ??
            "docs/implementation/deployment-e2e-results.json",
        ),
      },
    ],
  ],
});
