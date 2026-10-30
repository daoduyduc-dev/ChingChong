import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { io } from "socket.io-client";
import { parse } from "dotenv";
import { setTimeout, clearTimeout } from "node:timers";
const config = parse(readFileSync(".local/release.env"));
const url = new URL("postgresql://127.0.0.1/kyvien");
url.username = "kyvien";
url.password = config.POSTGRES_PASSWORD;
url.port = config.POSTGRES_PORT ?? "54330";
const compose = [
  "compose",
  "-p",
  "kyvien-release",
  "--env-file",
  ".local/release.env",
];
function docker(args) {
  const r = spawnSync("docker", [...compose, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw Error("Local container lifecycle command failed");
}
async function snapshot() {
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  try {
    const rows = [];
    for (const table of ["User", "Identity", "Move", "Match"]) {
      const filter =
        table === "Match"
          ? " WHERE t.\"status\" IN ('FINISHED','CANCELED','SAVED')"
          : "";
      const [r] = await db.$queryRawUnsafe(
        `SELECT count(*)::int AS count, md5(coalesce(string_agg(row_to_json(t)::text, E'\\n' ORDER BY row_to_json(t)::text), '')) AS digest FROM "${table}" t${filter}`,
      );
      rows.push({ table, ...r });
    }
    return rows;
  } finally {
    await db.$disconnect();
  }
}
const before = await snapshot();
docker(["stop"]);
docker(["up", "-d", "--wait", "--wait-timeout", "120"]);
const after = await snapshot();
const comparisons = before.map((b, i) => ({
  table: b.table,
  before: b.count,
  after: after[i].count,
  contentUnchanged: b.digest === after[i].digest,
}));
const health = await globalThis.fetch(config.APP_URL + "/api/health");
const guest = await globalThis.fetch(config.APP_URL + "/api/auth/guest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
if (!guest.ok) throw Error("Guest acceptance session unavailable");
const { token } = await guest.json();
const socket = io(config.APP_URL, {
  transports: ["websocket"],
  reconnection: false,
  auth: { token, controlId: randomUUID() },
});
let upgraded = false;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("WebSocket upgrade timeout")),
      10000,
    );
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  upgraded = socket.io.engine.transport.name === "websocket";
} finally {
  socket.disconnect();
}
const report = {
  date: new Date().toISOString(),
  scope:
    "Local Compose cold restart with persistent volume; original user database is not used; real WebSocket-only connection through Nginx; terminal/SAVED rows checked, active recovery separately unit-tested",
  status:
    comparisons.every((r) => r.contentUnchanged && r.before === r.after) &&
    health.ok &&
    upgraded
      ? "PASS"
      : "FAIL",
  health: health.status,
  websocketUpgrade: upgraded,
  persistentData: comparisons,
};
writeFileSync(
  "docs/implementation/release-operations-results.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
process.exit(report.status === "PASS" ? 0 : 1);
