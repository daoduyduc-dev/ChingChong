import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { mountFrontend } from "../server/src/frontend";
import { makeApp } from "../server/src/app";

const directory = mkdtempSync(join(tmpdir(), "kyvien-fe-"));
mkdirSync(join(directory, "assets"));
writeFileSync(
  join(directory, "index.html"),
  "<!doctype html><title>Kỳ Viện</title><div id='root'></div>",
);
writeFileSync(join(directory, "assets/app-123.js"), "console.log('bundle')");
writeFileSync(
  join(directory, "sw.js"),
  "self.addEventListener('fetch',()=>{})",
);
const app = express();
app.get("/api/example", (_req, res) => res.json({ actualApi: true }));
app.use("/api", (_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
mountFrontend(app, directory);
afterAll(() => rmSync(directory, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());
describe("single-origin frontend deployment", () => {
  it.each([
    ["http://127.0.0.1:5181", false],
    ["https://ky-vien-test.onrender.com", true],
  ] as const)(
    "uses an origin-appropriate upgrade CSP for %s",
    async (origin, upgraded) => {
      vi.stubEnv("APP_URL", origin);
      const runtime = makeApp();
      try {
        const response = await request(runtime.app).get("/api/config");
        expect(
          response.headers["content-security-policy"].includes(
            "upgrade-insecure-requests",
          ),
        ).toBe(upgraded);
      } finally {
        runtime.io.close();
        runtime.http.close();
      }
    },
  );
  it("serves root and extensionless SPA deep links without long caching", async () => {
    for (const path of ["/", "/history", "/friends/player"]) {
      const response = await request(app).get(path).set("Accept", "text/html");
      expect(response.status).toBe(200);
      expect(response.text).toContain("Kỳ Viện");
      expect(response.headers["cache-control"]).toContain("no-store");
    }
  });
  it("keeps API responses and missing API paths out of the SPA fallback", async () => {
    expect((await request(app).get("/api/example")).body).toEqual({
      actualApi: true,
    });
    const missing = await request(app)
      .get("/api/missing")
      .set("Accept", "text/html");
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("NOT_FOUND");
  });
  it("caches build assets, refreshes SW/index and never sends HTML for missing assets", async () => {
    expect(
      (await request(app).get("/assets/app-123.js")).headers["cache-control"],
    ).toContain("immutable");
    for (const path of ["/sw.js", "/index.html"])
      expect((await request(app).get(path)).headers["cache-control"]).toContain(
        "no-store",
      );
    for (const path of ["/assets/missing.js", "/socket.io/missing", "/.env"])
      expect((await request(app).get(path)).status).toBe(404);
  });
  it("fails startup when explicitly enabled without a build", () => {
    expect(() => mountFrontend(express(), join(directory, "missing"))).toThrow(
      "FRONTEND_BUILD_MISSING",
    );
  });
  it("derives Render origin before cookies/OAuth configuration and respects a custom HTTPS origin", () => {
    for (const [custom, expected] of [
      ["", "https://ky-vien-test.onrender.com"],
      ["https://chess.example.com", "https://chess.example.com"],
    ]) {
      const child = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "await import('./server/env.mjs'); console.log(JSON.stringify({url:process.env.APP_URL,host:process.env.API_HOST,serve:process.env.SERVE_CLIENT}))",
        ],
        {
          env: {
            ...process.env,
            RENDER: "true",
            RENDER_EXTERNAL_URL: "https://ky-vien-test.onrender.com",
            APP_URL: custom,
            API_HOST: "",
            SERVE_CLIENT: "",
          },
          encoding: "utf8",
        },
      );
      expect(child.status).toBe(0);
      expect(JSON.parse(child.stdout)).toEqual({
        url: expected,
        host: "0.0.0.0",
        serve: "true",
      });
    }
  });
  it("advertises only configured Google; Facebook endpoints cannot initiate OAuth", async () => {
    const runtime = makeApp();
    try {
      const config = await request(runtime.app).get("/api/config");
      expect(Object.keys(config.body.oauth)).toEqual(["google"]);
      const fb = await request(runtime.app).get("/api/auth/oauth/facebook");
      expect(fb.status).toBeGreaterThanOrEqual(400);
      expect(fb.headers.location).toBeUndefined();
    } finally {
      runtime.io.close();
      runtime.http.close();
    }
  });
});
