import { mailConfigured } from "./services/auth";
import { route } from "./controllers/http";
import { registerUserRoutes } from "./controllers/user.controller";
import { registerAdminRoutes } from "./controllers/admin.controller";
import { registerSocialRoutes } from "./controllers/social.controller";
import { registerGameRoutes } from "./controllers/game.controller";
import {
  registerPublicAuthRoutes,
  registerProtectedAuthRoutes,
} from "./controllers/auth.controller";
import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { Prisma } from "@prisma/client";
import { z, ZodError } from "zod";
import { db } from "./database/db";
import { AuthService } from "./services/auth";
import { GameService } from "./services/game";
import { assert, DomainError } from "./common/errors";
import type { Actor, MatchState, RoomState } from "../../shared/domain";
import { fileURLToPath } from "node:url";
import { mountFrontend } from "./middleware/frontend";
const coordinate = z.number().int().min(0).max(89),
  moveSchema = z.object({
    matchId: z.uuid(),
    moveId: z.uuid(),
    expectedVersion: z.number().int().nonnegative(),
    from: coordinate,
    to: coordinate,
  });
export function makeApp(game = new GameService(), auth = new AuthService()) {
  game.authorizeActor = async (a, tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id"=${a.sessionId} FOR SHARE`;
    const session = await tx.session.findUnique({
      where: { id: a.sessionId },
      include: { user: true },
    });
    assert(
      session &&
        !session.revokedAt &&
        session.expiresAt.getTime() > Date.now() &&
        (session.userId ?? session.guestId) === a.id &&
        (!session.user ||
          (session.user.status === "ACTIVE" && !session.user.deletedAt)),
      "SESSION_REVOKED",
      401,
    );
  };
  const control = new Map<string, string>();
  const app = express(),
    http = createServer(app),
    io = new Server(http, {
      cors: { origin: process.env.APP_URL, credentials: true },
      maxHttpBufferSize: 20000,
    });
  app.set("trust proxy", Number(process.env.TRUST_PROXY ?? 0));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Safari/WebKit also upgrades loopback HTTP, breaking local rehearsals.
          // Render's HTTPS origin retains the strict upgrade policy.
          "upgrade-insecure-requests": process.env.APP_URL?.startsWith("https:")
            ? []
            : null,
        },
      },
    }),
    cors({ origin: process.env.APP_URL, credentials: true }),
    express.json({ limit: "1mb" }),
    cookieParser(),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 180,
      message: { error: "RATE_LIMITED" },
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 60000,
      limit: 25,
      message: { error: "RATE_LIMITED" },
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get(
    "/api/health",
    route(async () => {
      await db.$queryRaw`SELECT 1`;
      return { status: "ok" };
    }),
  );
  app.get("/api/config", (_req, res) =>
    res.json({
      oauth: {
        google: !!(
          process.env.APP_URL &&
          process.env.GOOGLE_CLIENT_ID &&
          process.env.GOOGLE_CLIENT_SECRET
        ),
      },
      smtp: mailConfigured(),
    }),
  );
  registerPublicAuthRoutes(app, auth, game);
  app.use("/api", auth.middleware);
  app.use("/api", (req, res, next) => {
    try {
      if (
        ["POST", "PATCH", "DELETE"].includes(req.method) &&
        /^\/(matches|rooms|matchmaking)(\/|$)/.test(req.path)
      ) {
        const current = io.sockets.sockets.get(
          control.get(res.locals.actor.id) ?? "",
        );
        assert(
          current &&
            current.handshake.auth.controlId === req.headers["x-control-id"],
          "SESSION_REVOKED",
          401,
        );
      }
      next();
    } catch (e) {
      next(e);
    }
  });
  registerProtectedAuthRoutes(app, auth);
  registerUserRoutes(app, auth, game);
  registerSocialRoutes(app, game, io);
  const queue = new Map<string, { actor: Actor; minutes: number }>();
  registerGameRoutes(app, game, io, queue);
  registerAdminRoutes(app, auth, game);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "NOT_FOUND" });
  });
  if (process.env.SERVE_CLIENT === "true")
    mountFrontend(
      app,
      fileURLToPath(new URL("../../client/dist/", import.meta.url)),
    );
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      let code = "INTERNAL_ERROR",
        status = 500;
      if (
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          ["P1001", "P1002", "P1017"].includes(error.code)) ||
        error instanceof Prisma.PrismaClientInitializationError
      ) {
        if (!game.incident) {
          game.incident = true;
          io.emit("service:unavailable");
        }
      }
      if (error instanceof DomainError) {
        code = error.code;
        status = error.status;
      } else if (error instanceof ZodError) {
        code = "VALIDATION_ERROR";
        status = 400;
      } else if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        code = "ALREADY_EXISTS";
        status = 409;
      }
      if (status === 500)
        console.error(
          "request_failed",
          error instanceof Error ? error.name : "Unknown",
        );
      res.status(status).json({ error: code });
    },
  );
  auth.onRevoke = async (sid) => {
    const sockets = await io.fetchSockets();
    for (const s of sockets)
      if (s.data.actor?.sessionId === sid) {
        s.emit("session:revoked");
        s.disconnect(true);
      }
  };
  game.publish = (event, state) => {
    if ("seats" in state) {
      for (const seat of (state as RoomState).seats)
        io.to("actor:" + seat.id).emit(event, state);
    } else {
      const m = state as MatchState;
      io.to("actor:" + m.red)
        .to("actor:" + m.black)
        .emit(event, m);
    }
  };
  game.notify = (id) => {
    io.to("actor:" + id).emit("notification:new");
  };
  game.recovered = () => {
    io.emit("service:recovered");
  };
  io.use(async (socket, next) => {
    try {
      socket.data.actor = await auth.authenticate(
        String(socket.handshake.auth.token),
      );
      z.uuid().parse(socket.handshake.auth.controlId);
      next();
    } catch {
      next(Error("UNAUTHENTICATED"));
    }
  });
  io.on("connection", (socket) => {
    const a = socket.data.actor as Actor;
    const previous = control.get(a.id);
    if (previous) {
      const old = io.sockets.sockets.get(previous);
      old?.emit("control:replaced");
      old?.disconnect(true);
    }
    control.set(a.id, socket.id);
    if (game.incident) socket.emit("service:unavailable");
    void socket.join("actor:" + a.id);
    void game.connection(a.id, true).catch(() => {});
    const eventRates = new Map<string, { count: number; window: number }>();
    const handle = (
      event: string,
      fn: (data: any, a: Actor) => Promise<unknown>,
    ) =>
      socket.on(event, async (data, ack) => {
        try {
          // ICE candidates legitimately arrive in bursts. Keep their bounded
          // budget separate so they cannot starve moves or consent actions.
          const bucket = event === "video:signal" ? "media" : "game";
          let rate = eventRates.get(bucket);
          if (!rate || Date.now() - rate.window > 1000) {
            rate = { window: Date.now(), count: 0 };
            eventRates.set(bucket, rate);
          }
          assert(
            ++rate.count <= (bucket === "media" ? 120 : 20),
            "RATE_LIMITED",
            429,
          );
          assert(control.get(a.id) === socket.id, "SESSION_REVOKED", 401);
          const current = await auth.actorForSession(a.sessionId);
          const value = await fn(data, current);
          if (typeof ack === "function") ack({ ok: true, data: value });
        } catch (e) {
          const code =
            e instanceof DomainError
              ? e.code
              : e instanceof ZodError
                ? "VALIDATION_ERROR"
                : "INTERNAL_ERROR";
          if (typeof ack === "function") ack({ ok: false, error: code });
          if (code === "FORBIDDEN")
            void db.audit
              .create({
                data: {
                  actor: a.id,
                  action: "DENIED_" + event,
                  entityId:
                    typeof data?.matchId === "string"
                      ? data.matchId
                      : "unknown",
                },
              })
              .catch(() => {});
        }
      });
    handle("match:move", (input, current) => {
      const d = moveSchema.parse(input);
      return game.move(current, d.matchId, d.moveId, d.expectedVersion, {
        from: d.from,
        to: d.to,
      });
    });
    handle("chat:send", (input, current) => {
      const d = z
        .object({
          matchId: z.uuid(),
          messageId: z.uuid(),
          text: z.string().trim().min(1).max(500),
        })
        .parse(input);
      return game.chat(current, d.matchId, d.messageId, d.text);
    });
    handle("video:signal", async (input, current) => {
      const d = z
        .object({
          matchId: z.uuid(),
          sessionId: z.uuid(),
          signal: z.object({
            description: z
              .object({
                type: z.enum(["offer", "answer"]),
                sdp: z.string().max(15000),
              })
              .optional(),
            candidate: z
              .object({
                candidate: z.string().max(1500),
                sdpMid: z.string().max(100).nullable().optional(),
                sdpMLineIndex: z
                  .number()
                  .int()
                  .min(0)
                  .max(100)
                  .nullable()
                  .optional(),
                usernameFragment: z.string().max(256).nullable().optional(),
              })
              .optional(),
          }),
        })
        .parse(input);
      const m = await game.match(d.matchId, current.id);
      assert(
        m.video &&
          m.status === "ACTIVE" &&
          m.videoSessionId === d.sessionId &&
          !(await game.blocked(m.red, m.black)),
        "FORBIDDEN",
        403,
      );
      socket
        .to("actor:" + (current.id === m.red ? m.black : m.red))
        .emit("video:signal", d);
      return { ok: true };
    });
    socket.on("disconnect", () => {
      if (control.get(a.id) === socket.id) {
        control.delete(a.id);
        queue.delete(a.id);
        void game.connection(a.id, false).catch(() => {});
      }
    });
  });
  return { app, http, io, game, auth };
}
