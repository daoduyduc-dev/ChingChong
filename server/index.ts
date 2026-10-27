import "dotenv/config";
import { makeApp } from "./app";
import { db } from "./db";
import { secret } from "./auth";
secret();
const { http, game, io } = makeApp();
await db.$connect();
await game.recover();
http.listen(
  Number(process.env.PORT ?? 3001),
  process.env.API_HOST ?? "127.0.0.1",
  () => console.log("API ready http://127.0.0.1:" + (process.env.PORT ?? 3001)),
);
const timer = setInterval(() => {
  void game.tick().catch(() => {
    if (!game.incident) {
      game.incident = true;
      io.emit("service:unavailable");
    }
    console.error("tick_failed_database_unavailable");
  });
}, 500);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    io.close();
    http.close();
    void db.$disconnect().then(() => process.exit(0));
  });
