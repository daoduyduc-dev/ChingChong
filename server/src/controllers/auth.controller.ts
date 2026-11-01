import type { Express } from "express";
import { z } from "zod";
import { AuthService } from "../services/auth";
import { GameService } from "../services/game";
import { loginWithGuest } from "../services/login";
import { actor, route, user } from "./http";

export function registerPublicAuthRoutes(
  app: Express,
  auth: AuthService,
  game: GameService,
) {
  app.post(
    "/api/auth/register",
    route((req) => auth.register(req.body)),
  );
  app.post(
    "/api/auth/login",
    route((req, res) =>
      loginWithGuest(auth, game, req.cookies.refresh, req.body, res),
    ),
  );
  app.post(
    "/api/auth/guest",
    route((_req, res) => auth.guest(res)),
  );
  app.post(
    "/api/auth/refresh",
    route((req, res) => auth.refresh(req.cookies.refresh, res)),
  );
  app.post(
    "/api/auth/forgot-password",
    route((req) => auth.forgot(req.body)),
  );
  app.post(
    "/api/auth/reset-password",
    route((req) => auth.reset(req.body)),
  );
  for (const provider of ["google"] as const) {
    app.get(
      "/api/auth/oauth/" + provider,
      route((_req, res) => auth.oauthStart(provider, res)),
    );
    app.get(
      "/api/auth/oauth/" + provider + "/callback",
      route((req, res) => auth.oauthCallback(provider, req, res)),
    );
  }
}

export function registerProtectedAuthRoutes(app: Express, auth: AuthService) {
  app.get(
    "/api/auth/me",
    route(async (_req, res) => ({ actor: actor(res) })),
  );
  app.post(
    "/api/auth/logout",
    route(async (_req, res) => {
      await auth.logout(actor(res), res);
      return { ok: true };
    }),
  );
  app.post(
    "/api/auth/change-password",
    route((_req, res) => auth.change(actor(res))),
  );
  app.post(
    "/api/auth/set-password",
    route((_req, res) => auth.change(actor(res))),
  );
  app.post(
    "/api/auth/oauth/:provider/link",
    route(async (req, res) => {
      const a = user(res),
        provider = z.literal("google").parse(req.params.provider);
      await auth.oauthStart(provider, res, a);
    }),
  );
}
