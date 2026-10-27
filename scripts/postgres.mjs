import EmbeddedPostgres from "embedded-postgres";
import { existsSync, mkdirSync } from "node:fs";
const directory = new URL(
  "../.local/postgres",
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(new URL("../.local", import.meta.url), { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: "kyvien",
  password: "local_dev_only",
  port: 54329,
  persistent: true,
});
if (!existsSync(directory + "/PG_VERSION")) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase("kyvien");
} catch (e) {
  if (!String(e).includes("already exists")) throw e;
}
console.log("PostgreSQL ready on 127.0.0.1:54329 (local development only)");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 60000);
