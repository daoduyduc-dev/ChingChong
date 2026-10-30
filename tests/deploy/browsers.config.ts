import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: ".",
  outputDir: "../../test-results/deployment-browsers",
  testMatch: "smoke.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.DEPLOY_ORIGIN ?? "http://127.0.0.1:5180",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: ["chromium", "firefox", "webkit"].map((browserName) => ({
    name: browserName,
    use: { browserName: browserName as "chromium" | "firefox" | "webkit" },
  })),
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: resolve(
          process.env.BROWSER_REPORT_FILE ??
            "docs/implementation/deployment-browser-results.json",
        ),
      },
    ],
  ],
});
