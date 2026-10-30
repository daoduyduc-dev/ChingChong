import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Shell/deployment environment wins over the backend-only local file.
config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
  quiet: true,
});

// Render supplies this trusted URL after provisioning the service. Never derive
// OAuth redirect targets from request Host/X-Forwarded-Host headers.
if (process.env.RENDER === "true") {
  process.env.APP_URL ||= process.env.RENDER_EXTERNAL_URL;
  if (!process.env.APP_URL || !process.env.APP_URL.startsWith("https://"))
    throw Error("Render requires an HTTPS APP_URL or RENDER_EXTERNAL_URL");
  process.env.API_HOST ||= "0.0.0.0";
  process.env.SERVE_CLIENT ||= "true";
}

// Railway makes this domain available after Networking > Generate Domain.
// Allow the first health check before a domain exists; OAuth stays disabled.
if (process.env.RAILWAY_ENVIRONMENT_ID) {
  if (!process.env.APP_URL && process.env.RAILWAY_PUBLIC_DOMAIN)
    process.env.APP_URL = "https://" + process.env.RAILWAY_PUBLIC_DOMAIN;
  if (process.env.APP_URL && !process.env.APP_URL.startsWith("https://"))
    throw Error("Railway requires an HTTPS APP_URL");
  process.env.API_HOST ||= "0.0.0.0";
  process.env.SERVE_CLIENT ||= "true";
}
