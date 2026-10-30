import "../server/env.mjs";
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
const suffix = process.platform === "win32" ? ".exe" : "";
const missing = ["pg_dump", "pg_restore"].filter(
  (tool) => !existsSync(resolve(bin, tool + suffix)),
);
const dockerClient =
  missing.length > 0 &&
  spawnSync("docker", ["image", "inspect", "postgres:18"], { stdio: "ignore" })
    .status === 0;
if (missing.length && !dockerClient) {
  writeFileSync(
    "docs/implementation/backup-restore.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        status: "BLOCKED",
        reason:
          "Install PostgreSQL 18+ client tools (PG_TOOLS_BIN) or pull Docker postgres:18 for local rehearsal",
        missing,
        sourceUnchanged: true,
        restoreAttempted: false,
      },
      null,
      2,
    ),
  );
  console.error(
    "Backup rehearsal BLOCKED: provide PostgreSQL client tools or Docker postgres:18. No database changed.",
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
  const command = dockerClient ? "docker" : resolve(bin, tool + suffix);
  const parameters = dockerClient
    ? [
        "run",
        "--rm",
        "--mount",
        `type=bind,source=${directory},target=/backups`,
        ...["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD"].flatMap((key) => [
          "-e",
          key,
        ]),
        "postgres:18",
        tool,
        ...args.map((arg) =>
          arg === file ? "/backups/" + name + ".dump" : arg,
        ),
      ]
    : args;
  const r = spawnSync(command, parameters, {
    env: dockerClient ? { ...env, PGHOST: "host.docker.internal" } : env,
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
    const query =
      "SELECT count(*)::int AS n, md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) AS digest FROM " +
      identifier +
      " t";
    const [a] = await source.$queryRawUnsafe(query);
    const [b] = await restored.$queryRawUnsafe(query);
    counts.push({
      table: tablename,
      source: a.n,
      restored: b.n,
      match: a.n === b.n && a.digest === b.digest,
      contentDigestMatch: a.digest === b.digest,
    });
  }
  const report = {
    date: new Date().toISOString(),
    status: counts.every((c) => c.match) ? "PASS" : "FAIL",
    client: dockerClient
      ? "Docker postgres:18 client; host DB kept local"
      : "native PostgreSQL client",
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
