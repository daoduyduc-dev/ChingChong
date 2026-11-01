import { it, expect } from "vitest";
import { preview, type PreviewServer } from "vite";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { makeApp } from "../../server/src/app";
import { db } from "../../server/src/database/db";

it("existing acceptance journeys pass against a bounded local backend and preview", async () => {
  const backend = makeApp();
  let frontend: PreviewServer | undefined,
    timer: ReturnType<typeof setInterval> | undefined;
  try {
    await backend.game.recover();
    await new Promise<void>((resolve) =>
      backend.http.listen(0, "127.0.0.1", resolve),
    );
    const target =
      "http://127.0.0.1:" + (backend.http.address() as AddressInfo).port;
    frontend = await preview({
      root: fileURLToPath(new URL("../../client", import.meta.url)),
      configFile: fileURLToPath(
        new URL("../../client/vite.config.ts", import.meta.url),
      ),
      preview: {
        host: "127.0.0.1",
        port: 0,
        strictPort: true,
        proxy: { "/api": target, "/socket.io": { target, ws: true } },
      },
    });
    const origin =
      "http://127.0.0.1:" + (frontend.httpServer.address() as AddressInfo).port;
    timer = setInterval(() => {
      void backend.game.tick().catch(() => {});
    }, 100);
    const child = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        "tests/ui/journeys.config.ts",
      ],
      {
        env: { ...process.env, UI_TEST_ORIGIN: origin },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    expect(code, output).toBe(0);
  } finally {
    clearInterval(timer);
    await new Promise<void>((resolve) => backend.io.close(() => resolve()));
    await backend.game.serial(async () => {});
    if (frontend)
      await new Promise<void>((resolve) =>
        frontend!.httpServer.close(() => resolve()),
      );
    await db.$disconnect();
  }
}, 150000);
