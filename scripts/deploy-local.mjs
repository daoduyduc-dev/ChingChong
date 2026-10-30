import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";
const path = ".local/release.env";
if (!existsSync(path)) {
  if (
    spawnSync("docker", ["volume", "inspect", "kyvien-release_postgres-data"], {
      stdio: "ignore",
    }).status === 0
  )
    throw Error(
      "Existing release volume found. Restore its .local/release.env; do not generate a different database password.",
    );
  mkdirSync(".local", { recursive: true });
  writeFileSync(
    path,
    [
      "POSTGRES_PASSWORD=" + randomBytes(24).toString("hex"),
      "JWT_SECRET=" + randomBytes(48).toString("hex"),
      "APP_URL=http://127.0.0.1:5180",
      "POSTGRES_PORT=54330",
      "BACKEND_PORT=3003",
      "FRONTEND_PORT=5180",
      "TRUST_PROXY=1",
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
}
const config = parse(readFileSync(path));
const url = new URL(config.APP_URL);
if (
  url.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(url.hostname)
)
  throw Error(
    "This helper is for local rehearsal only; use the managed-DB runbook for public deployment.",
  );
const result = spawnSync(
  "docker",
  [
    "compose",
    "-p",
    "kyvien-release",
    "--env-file",
    path,
    "up",
    "-d",
    "--build",
    "--wait",
    "--wait-timeout",
    "180",
  ],
  { stdio: "inherit" },
);
if (result.status) process.exit(result.status ?? 1);
console.log("Local container deployment ready: " + config.APP_URL);
