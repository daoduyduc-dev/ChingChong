import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";

/** Serve the Vite build on the same origin as REST and Socket.IO. */
export function mountFrontend(app: Express, directory: string) {
  const index = join(directory, "index.html");
  if (!existsSync(index))
    throw Error("FRONTEND_BUILD_MISSING: run npm run build");
  app.use(
    express.static(directory, {
      index: false,
      dotfiles: "deny",
      setHeaders(res, file) {
        res.setHeader(
          "Cache-Control",
          file.includes("/assets/") || file.includes("\\assets\\")
            ? "public, max-age=31536000, immutable"
            : "no-cache, no-store",
        );
      },
    }),
  );
  app.get("/{*path}", (req, res, next) => {
    // Missing scripts/fonts and reserved backend paths must never become HTML.
    if (
      req.path.startsWith("/api") ||
      req.path.startsWith("/socket.io") ||
      req.path.split("/").some((part) => part.startsWith(".")) ||
      extname(req.path) ||
      !req.accepts("html")
    )
      return next();
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.sendFile(index);
  });
}
