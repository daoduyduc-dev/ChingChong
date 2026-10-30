import "../server/env.mjs";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
// Test tooling must never use the application DATABASE_URL (possibly Supabase).
const url = new URL(
  process.env.TEST_DATABASE_URL ??
    "postgresql://kyvien:local_dev_only@127.0.0.1:54329/kyvien_utf8_test",
);
const database = url.pathname.slice(1);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !/^[a-zA-Z0-9_]+_test$/.test(database)
)
  throw Error("TEST_DATABASE_URL must target a local database ending in _test");
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
const client = new PrismaClient({ datasourceUrl: adminUrl.toString() });
try {
  const exists =
    await client.$queryRaw`SELECT datname FROM pg_database WHERE datname = ${database}`;
  if (!exists.length)
    await client.$executeRawUnsafe(
      `CREATE DATABASE "${database}" WITH TEMPLATE template0 ENCODING 'UTF8'`,
    );
} finally {
  await client.$disconnect();
}
const env = { ...process.env, DATABASE_URL: url.toString() };
const migrate = spawnSync(
  process.execPath,
  [
    "node_modules/prisma/build/index.js",
    "migrate",
    "deploy",
    "--schema",
    "server/prisma/schema.prisma",
  ],
  { stdio: "inherit", env },
);
if (migrate.status) process.exit(migrate.status);
const result = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", ...process.argv.slice(2)],
  { stdio: "inherit", env },
);
process.exit(result.status ?? 1);
