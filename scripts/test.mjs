import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
const client = new PrismaClient();
const exists =
  await client.$queryRaw`SELECT datname FROM pg_database WHERE datname = 'kyvien_test'`;
if (!exists.length)
  await client.$executeRawUnsafe('CREATE DATABASE "kyvien_test"');
await client.$disconnect();
const url = new URL(process.env.DATABASE_URL);
url.pathname = "/kyvien_test";
const env = { ...process.env, DATABASE_URL: url.toString() };
const migrate = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", env },
);
if (migrate.status) process.exit(migrate.status);
const result = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", ...process.argv.slice(2)],
  { stdio: "inherit", env },
);
process.exit(result.status ?? 1);
