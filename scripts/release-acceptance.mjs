import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
// This runner deliberately targets only the isolated Compose deployment.
const config = parse(
  readFileSync(process.env.LOCAL_ACCEPTANCE_ENV_FILE ?? ".local/release.env"),
);
const prefix = process.env.ACCEPTANCE_REPORT_PREFIX ?? "deployment-e2e";
if (!/^[a-z0-9-]+$/.test(prefix)) throw Error("Invalid report prefix");
const database = new URL("postgresql://127.0.0.1/kyvien");
database.username = "kyvien";
database.password = config.POSTGRES_PASSWORD;
database.port = config.POSTGRES_PORT ?? "54330";
const reports = [];
for (const [index, filter] of [
  ["--grep-invert", "TC-016/019"],
  ["--grep", "TC-016/019"],
].entries()) {
  // This machine's independent browser users share a real source IP at Nginx.
  // Pace batches across the auth window; do not disable or loosen the limiter.
  if (index) {
    console.log(
      "Waiting 61s for the real auth IP window; limiter remains enabled.",
    );
    await setTimeout(61000);
  }
  const path = `docs/implementation/${prefix}-batch-${index + 1}.json`;
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config",
      "tests/deploy/acceptance.config.ts",
      ...filter,
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: database.toString(),
        DEPLOY_ORIGIN: config.APP_URL,
        DEPLOY_REPORT_FILE: path,
      },
      stdio: "inherit",
    },
  );
  reports.push({
    exitCode: result.status,
    report: JSON.parse(readFileSync(path, "utf8")),
  });
}
const summary = {
  date: new Date().toISOString(),
  origin: config.APP_URL,
  scope:
    "Two paced batches cover all eight existing journeys through the deployed same-origin application and PostgreSQL; Chromium fake capture",
  passed: reports.reduce((sum, r) => sum + r.report.stats.expected, 0),
  failed: reports.reduce((sum, r) => sum + r.report.stats.unexpected, 0),
  status: reports.every((r) => r.exitCode === 0) ? "PASS" : "FAIL",
  reports,
};
writeFileSync(
  `docs/implementation/${prefix}-results.json`,
  JSON.stringify(summary, null, 2),
);
process.exit(summary.status === "PASS" ? 0 : 1);
