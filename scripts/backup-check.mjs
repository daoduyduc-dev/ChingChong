import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw Error("Local rehearsal only");
const directory = resolve(".local/backups");
mkdirSync(directory, { recursive: true });
const name = "kyvien_restoreqa_" + Date.now();
const file = resolve(directory, name + ".dump");
const bin = resolve(
  process.env.PG_TOOLS_BIN ??
    "node_modules/@embedded-postgres/windows-x64/native/bin",
);
const missing = ["pg_dump", "pg_restore"].filter(
  (tool) => !existsSync(resolve(bin, tool + ".exe")),
);
if (missing.length) {
  writeFileSync(
    "docs/implementation/backup-restore.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        status: "BLOCKED",
        reason:
          "PostgreSQL client tools absent; set PG_TOOLS_BIN to PostgreSQL 18+ client bin directory",
        missing,
        sourceUnchanged: true,
        restoreAttempted: false,
      },
      null,
      2,
    ),
  );
  console.error(
    "Backup rehearsal BLOCKED: install PostgreSQL 18+ client tools and set PG_TOOLS_BIN. No database changed.",
  );
  process.exit(1);
}
const env = {
  ...process.env,
  PGHOST: url.hostname,
  PGPORT: url.port,
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
};
function run(tool, args) {
  const r = spawnSync(resolve(bin, tool + ".exe"), args, {
    env,
    encoding: "utf8",
  });
  if (r.status !== 0)
    throw Error(
      tool + " failed; inspect local configuration (details withheld)",
    );
}
const source = new PrismaClient();
let restored;
try {
  run("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--file",
    file,
    "--dbname",
    url.pathname.slice(1),
  ]);
  await source.$executeRawUnsafe('CREATE DATABASE "' + name + '"');
  run("pg_restore", [
    "--no-owner",
    "--no-privileges",
    "--exit-on-error",
    "--dbname",
    name,
    file,
  ]);
  const targetURL = new URL(url);
  targetURL.pathname = "/" + name;
  restored = new PrismaClient({
    datasources: { db: { url: targetURL.toString() } },
  });
  const tables =
    await source.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const counts = [];
  for (const { tablename } of tables) {
    const identifier = '"' + tablename.replaceAll('"', '""') + '"';
    const [a] = await source.$queryRawUnsafe(
      "SELECT count(*)::int AS n FROM " + identifier,
    );
    const [b] = await restored.$queryRawUnsafe(
      "SELECT count(*)::int AS n FROM " + identifier,
    );
    counts.push({
      table: tablename,
      source: a.n,
      restored: b.n,
      match: a.n === b.n,
    });
  }
  const report = {
    date: new Date().toISOString(),
    status: counts.every((c) => c.match) ? "PASS" : "FAIL",
    scope:
      "Local logical dump restored into newly created database; source unchanged; counts checked while app idle; not production DR/RPO/RTO certification",
    targetDatabase: name,
    backupFile: ".local/backups/" + name + ".dump",
    tables: counts,
  };
  writeFileSync(
    "docs/implementation/backup-restore.json",
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      tables: counts.length,
      sourceUnchanged: true,
    }),
  );
  if (report.status !== "PASS") process.exitCode = 1;
} finally {
  await restored?.$disconnect();
  await source.$disconnect();
}
