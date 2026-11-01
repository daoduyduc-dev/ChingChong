import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";

function railway(domain: string, appUrl = "") {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      "await import('./server/env.mjs'); const {cookieOptions}=await import('./server/src/services/auth.ts'); console.log(JSON.stringify({url:process.env.APP_URL||null,host:process.env.API_HOST,serve:process.env.SERVE_CLIENT,secure:cookieOptions.secure}));",
    ],
    {
      env: {
        ...process.env,
        RENDER: "",
        RAILWAY_ENVIRONMENT_ID: "test-environment",
        RAILWAY_PUBLIC_DOMAIN: domain,
        APP_URL: appUrl,
        API_HOST: "",
        SERVE_CLIENT: "",
      },
      encoding: "utf8",
    },
  );
}
it("Railway derives its HTTPS public origin and keeps cookies Secure", () => {
  const r = railway("ky-vien-test.up.railway.app");
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout)).toEqual({
    url: "https://ky-vien-test.up.railway.app",
    host: "0.0.0.0",
    serve: "true",
    secure: true,
  });
});
it("Railway can start health checks before Generate Domain without weakening cookies", () => {
  const r = railway("");
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout)).toEqual({
    url: null,
    host: "0.0.0.0",
    serve: "true",
    secure: true,
  });
});
it("Railway respects a custom HTTPS origin and rejects an HTTP production origin", () => {
  const r = railway("ky-vien-test.up.railway.app", "https://chess.example.com");
  expect(r.status).toBe(0);
  expect(JSON.parse(r.stdout).url).toBe("https://chess.example.com");
  expect(
    railway("ky-vien-test.up.railway.app", "http://localhost:5174").status,
  ).not.toBe(0);
});
