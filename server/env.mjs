import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Shell/deployment environment wins over the backend-only local file.
config({
  path: fileURLToPath(new URL("./.env", import.meta.url)),
  quiet: true,
});
