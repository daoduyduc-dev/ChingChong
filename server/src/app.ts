import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { Prisma } from "@prisma/client";
import { z, ZodError } from "zod";
import { db } from "./db";
import { AuthService, hash } from "./auth";
import { GameService } from "./game";
import { assert, DomainError } from "./errors";
import {
  before,
  historyRows,
  order,
  page,
  pagination,
  summary,
} from "./browse";
import type { Actor, MatchState, RoomState } from "../../shared/domain";
import { fileURLToPath } from "node:url";
import { mountFrontend } from "./frontend";
const config = z.object({
  visibility: z.enum(["public", "private"]),
  minutes: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(30),
  ]),
  ownerSide: z.enum(["red", "black", "random"]),
  undo: z.boolean(),
});
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
  const route =
    (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      try {
        const data = await fn(req, res);
        if (!res.headersSent) res.json(data);
      } catch (e) {
        next(e);
      }
    };
  const actor = (res: express.Response) => res.locals.actor as Actor;
  const user = (res: express.Response) => {
    const a = actor(res);
    assert(!a.guest, "FORBIDDEN", 403);
    return a;
  };
  const id = (req: express.Request) => String(req.params.id);
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
      smtp: !!process.env.SMTP_HOST,
    }),
  );
  app.post(
    "/api/auth/register",
    route((req) => auth.register(req.body)),
  );
  app.post(
    "/api/auth/login",
    route(async (req, res) => {
      const old = req.cookies.refresh
        ? await db.session.findUnique({
            where: { refreshHash: hash(req.cookies.refresh) },
          })
        : null;
      const guest =
        old?.guestId && !old.revokedAt
          ? await auth.actorForSession(old.id)
          : null;
      const result = await auth.login(req.body, res);
      let mergeWarning: string | undefined;
      if (req.body.mergeGuest === true && guest) {
        try {
          await game.convertGuest(guest, result.actor);
        } catch (e) {
          if (
            e instanceof DomainError &&
            ["ALREADY_PLAYING", "ALREADY_IN_ROOM"].includes(e.code)
          ) {
            mergeWarning =
              "Không thể gộp Guest vì tài khoản đang bận. Dữ liệu User được giữ nguyên.";
            await db.session.update({
              where: { id: guest.sessionId },
              data: { revokedAt: new Date() },
            });
          } else throw e;
        }
        await auth.onRevoke(guest.sessionId);
      }
      return { ...result, ...(mergeWarning ? { mergeWarning } : {}) };
    }),
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
    route((req, res) => auth.change(actor(res), req.body, res)),
  );
  app.post(
    "/api/auth/set-password",
    route((req, res) => auth.setPassword(actor(res), req.body, res)),
  );
  app.post(
    "/api/auth/oauth/:provider/link",
    route(async (req, res) => {
      const a = user(res),
        provider = z.literal("google").parse(req.params.provider);
      await auth.oauthStart(provider, res, a);
    }),
  );
  app.get(
    "/api/users/me",
    route(async (_req, res) => {
      const a = user(res),
        u = await db.user.findUniqueOrThrow({ where: { id: a.id } });
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        publicCode: u.publicCode,
        avatar: u.avatar,
        hideHistory: u.hideHistory,
        role: u.role,
        hasPassword: !!u.passwordHash,
      };
    }),
  );
  app.patch(
    "/api/users/me",
    route(async (req, res) => {
      const a = user(res),
        d = z
          .object({
            displayName: z.string().trim().min(1).max(40).optional(),
            hideHistory: z.boolean().optional(),
            avatar: z
              .string()
              .max(600000)
              .refine(
                (v) =>
                  ["jade", "red", "gold"].includes(v) ||
                  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
                    v,
                  ),
              )
              .optional(),
          })
          .parse(req.body);
      return auth.serial(async () => {
        const u = await db.user.findUniqueOrThrow({ where: { id: a.id } });
        if (d.displayName && d.displayName !== u.displayName)
          assert(
            !u.nameChangedAt ||
              Date.now() - u.nameChangedAt.getTime() >= 7 * 86400000,
            "NAME_CHANGE_COOLDOWN",
          );
        await db.user.update({
          where: { id: a.id },
          data: {
            ...d,
            ...(d.displayName && d.displayName !== u.displayName
              ? { nameChangedAt: new Date() }
              : {}),
          },
        });
        return { ok: true };
      });
    }),
  );
  app.delete(
    "/api/users/me",
    route(async (_req, res) => {
      const a = user(res);
      await game.serial(() =>
        db.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: a.id },
            data: {
              deletedAt: new Date(),
              status: "DELETED",
              displayName: "Tài khoản đã xóa",
              avatar: "jade",
              hideHistory: true,
            },
          });
          await tx.session.updateMany({
            where: { userId: a.id },
            data: { revokedAt: new Date() },
          });
          await tx.audit.create({
            data: { actor: a.id, action: "SOFT_DELETE", entityId: a.id },
          });
          await game.anonymize(tx, a.id);
        }),
      );
      for (const s of await db.session.findMany({ where: { userId: a.id } }))
        await auth.onRevoke(s.id);
      return { ok: true };
    }),
  );
  app.get(
    "/api/users/search",
    route(async (req, res) => {
      const a = user(res),
        q = z.string().trim().min(2).max(120).parse(req.query.q);
      const users = await db.user.findMany({
        where: {
          id: { not: a.id },
          status: "ACTIVE",
          deletedAt: null,
          OR: [
            { username: { contains: q.toLowerCase() } },
            { publicCode: q },
            { email: q.toLowerCase() },
          ],
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          publicCode: true,
          avatar: true,
        },
        take: 20,
      });
      const results = [];
      for (const u of users)
        if (!(await game.blocked(a.id, u.id))) results.push(u);
      return results;
    }),
  );
  app.get(
    "/api/friends",
    route(async (_req, res) => {
      const a = user(res),
        rows = await db.friend.findMany({
          where: { OR: [{ a: a.id }, { b: a.id }] },
        });
      return Promise.all(
        rows.map(async (f) => {
          const u = await db.user.findUnique({
            where: { id: f.a === a.id ? f.b : f.a },
            select: {
              id: true,
              username: true,
              displayName: true,
              publicCode: true,
              avatar: true,
            },
          });
          return {
            ...f,
            user: u,
            presence:
              u && (await game.busy(u.id))
                ? "Đang chơi"
                : u && game.online.has(u.id)
                  ? "Online"
                  : "Offline",
          };
        }),
      );
    }),
  );
  app.post(
    "/api/friends/action",
    route(async (req, res) => {
      const a = user(res),
        d = z
          .object({
            target: z.uuid(),
            action: z.enum([
              "request",
              "accept",
              "reject",
              "cancel",
              "remove",
              "block",
              "unblock",
            ]),
          })
          .parse(req.body);
      assert(a.id !== d.target, "INVALID_TARGET");
      assert(
        await db.user.count({
          where: { id: d.target, status: "ACTIVE", deletedAt: null },
        }),
        "NOT_FOUND",
        404,
      );
      return game.serial(async () => {
        const pair = [a.id, d.target].sort().join(":"),
          f = await db.friend.findUnique({ where: { pair } });
        let status = f?.status ?? "NONE",
          blockedBy = f?.blockedBy ?? [],
          initiatedBy = f?.initiatedBy ?? a.id;
        if (d.action === "block") {
          blockedBy = [...new Set([...blockedBy, a.id])];
          status = "NONE";
        } else if (d.action === "unblock")
          blockedBy = blockedBy.filter((i) => i !== a.id);
        else {
          assert(!blockedBy.length, "FORBIDDEN", 403);
          if (d.action === "request") {
            if (status === "PENDING" && initiatedBy === d.target)
              status = "ACCEPTED";
            else if (status !== "ACCEPTED") {
              status = "PENDING";
              initiatedBy = a.id;
            }
          }
          if (d.action === "accept" || d.action === "reject") {
            assert(
              status === "PENDING" && initiatedBy !== a.id,
              "FORBIDDEN",
              403,
            );
            status = d.action === "accept" ? "ACCEPTED" : "NONE";
          }
          if (d.action === "cancel") {
            assert(initiatedBy === a.id, "FORBIDDEN", 403);
            status = "NONE";
          }
          if (d.action === "remove") status = "NONE";
        }
        const changed = await db.$transaction(async (tx) => {
          const relation = await tx.friend.upsert({
            where: { pair },
            create: {
              pair,
              a: [a.id, d.target].sort()[0],
              b: [a.id, d.target].sort()[1],
              status,
              initiatedBy,
              blockedBy,
            },
            update: { status, initiatedBy, blockedBy },
          });
          const matches: MatchState[] = [];
          if (d.action === "block") {
            const rows = await tx.match.findMany({
              where: {
                OR: [
                  { red: a.id, black: d.target },
                  { red: d.target, black: a.id },
                ],
                status: { in: ["ACTIVE", "PAUSED_RECONNECT", "RESUMING"] },
              },
            });
            for (const row of rows) {
              const m = row.state as unknown as MatchState;
              m.video = false;
              m.requests.forEach((r) => {
                if (r.status === "PENDING") r.status = "CANCELED";
              });
              m.version++;
              await game.writeMatch(tx, m);
              matches.push(m);
            }
            await tx.audit.create({
              data: { actor: a.id, action: "FRIEND_BLOCK", entityId: d.target },
            });
          } else if (["request", "accept", "reject"].includes(d.action)) {
            await tx.notification.create({
              data: {
                receiver: d.target,
                data: {
                  type: "FRIEND_UPDATE",
                  sender: a.name,
                  senderId: a.id,
                  status,
                },
              },
            });
          }
          return { relation, matches };
        });
        for (const m of changed.matches) game.publish("match:state", m);
        io.to("actor:" + d.target).emit("notification:new");
        return changed.relation;
      });
    }),
  );
  app.get(
    "/api/notifications",
    route(async (_req, res) =>
      db.notification.findMany({
        where: { receiver: actor(res).id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ),
  );
  app.post(
    "/api/notifications/:id/read",
    route(async (req, res) => {
      await db.notification.updateMany({
        where: { id: id(req), receiver: actor(res).id },
        data: { read: true },
      });
      return { ok: true };
    }),
  );
  app.get(
    "/api/rooms",
    route((_req, res) => game.list(actor(res))),
  );
  app.get(
    "/api/rooms/current",
    route(async (_req, res) => {
      const a = actor(res);
      const rows = await db.room.findMany();
      return (
        rows
          .map((r) => r.state as unknown as RoomState)
          .find(
            (r) => r.status !== "CLOSED" && r.seats.some((s) => s.id === a.id),
          ) ?? null
      );
    }),
  );
  app.get(
    "/api/users/:id/profile",
    route(async (req, res) => {
      const a = user(res),
        u = await db.user.findFirst({
          where: { id: id(req), status: "ACTIVE", deletedAt: null },
          select: {
            id: true,
            username: true,
            displayName: true,
            publicCode: true,
            avatar: true,
            hideHistory: true,
          },
        });
      assert(u, "NOT_FOUND", 404);
      assert(!(await game.blocked(a.id, u.id)), "FORBIDDEN", 403);
      return {
        ...u,
        presence: (await game.busy(u.id))
          ? "Đang chơi"
          : game.online.has(u.id)
            ? "Online"
            : "Offline",
      };
    }),
  );
  app.get(
    "/api/users/:id/history",
    route(async (req, res) => {
      const a = user(res),
        u = await db.user.findUnique({
          where: { id: id(req), deletedAt: null, status: "ACTIVE" },
        });
      assert(u, "NOT_FOUND", 404);
      assert(!(await game.blocked(a.id, u.id)), "FORBIDDEN", 403);
      return historyRows(u.id, a.id, u.hideHistory, req.query);
    }),
  );
  app.post(
    "/api/rooms",
    route((req, res) => game.create(actor(res), config.parse(req.body))),
  );
  app.post(
    "/api/rooms/join-code",
    route(async (req, res) => {
      const d = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
      const r = await db.room.findUnique({ where: { code: d.code } });
      assert(r, "ROOM_CLOSED", 404);
      return game.roomAction(actor(res), r.id, "join");
    }),
  );
  app.get(
    "/api/rooms/:id",
    route(async (req, res) => {
      const r = await game.room(id(req));
      assert(
        r.seats.some((s) => s.id === actor(res).id),
        "FORBIDDEN",
        403,
      );
      return r;
    }),
  );
  for (const action of ["join", "ready", "leave", "config", "rematch"] as const)
    app.post(
      "/api/rooms/:id/" + action,
      route((req, res) =>
        game.roomAction(
          actor(res),
          id(req),
          action,
          action === "config"
            ? config.parse(req.body)
            : action === "ready"
              ? z.object({ version: z.number().int() }).parse(req.body)
              : {},
        ),
      ),
    );
  app.post(
    "/api/rooms/:id/invite",
    route(async (req, res) => {
      const a = user(res),
        target = z.object({ target: z.uuid() }).parse(req.body).target,
        r = await game.room(id(req));
      assert(
        r.seats.some((s) => s.id === a.id) && r.status === "WAITING",
        "FORBIDDEN",
        403,
      );
      const f = await db.friend.findUnique({
        where: { pair: [a.id, target].sort().join(":") },
      });
      assert(f?.status === "ACCEPTED" && !f.blockedBy.length, "FORBIDDEN", 403);
      const notification = await db.notification.create({
        data: {
          receiver: target,
          data: {
            type: "ROOM_INVITE",
            roomId: r.id,
            code: r.code,
            sender: a.name,
          },
        },
      });
      game.notify(target);
      return notification;
    }),
  );
  const queue = new Map<string, { actor: Actor; minutes: number }>();
  let queueTail: Promise<unknown> = Promise.resolve();
  const queued = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = queueTail.then(fn, fn);
    queueTail = result.catch(() => {});
    return result;
  };
  app.post(
    "/api/matchmaking/join",
    route((req, res) =>
      queued(async () => {
        const a = actor(res),
          minutes = config.shape.minutes.parse(req.body.minutes);
        assert(!(await game.busy(a.id)), "ALREADY_PLAYING");
        const activeRooms = await db.room.findMany();
        assert(
          !activeRooms.some((row) => {
            const r = row.state as unknown as RoomState;
            return r.status !== "CLOSED" && r.seats.some((s) => s.id === a.id);
          }),
          "ALREADY_IN_ROOM",
        );
        queue.delete(a.id);
        for (const entry of queue.values()) {
          if (
            !game.online.has(entry.actor.id) ||
            (await game.busy(entry.actor.id)) ||
            activeRooms.some((row) => {
              const r = row.state as unknown as RoomState;
              return (
                r.status !== "CLOSED" &&
                r.seats.some((s) => s.id === entry.actor.id)
              );
            })
          ) {
            queue.delete(entry.actor.id);
            continue;
          }
          if (
            entry.actor.id !== a.id &&
            entry.minutes === minutes &&
            !(await game.blocked(a.id, entry.actor.id))
          ) {
            queue.delete(entry.actor.id);
            let r: RoomState;
            try {
              r = await game.create(entry.actor, {
                mode: "RANDOM",
                visibility: "private",
                minutes,
                ownerSide: "random",
                undo: true,
              });
            } catch (e) {
              if (
                e instanceof DomainError &&
                [
                  "ALREADY_IN_ROOM",
                  "ALREADY_PLAYING",
                  "SESSION_REVOKED",
                ].includes(e.code)
              )
                continue;
              throw e;
            }
            const joined = await game.roomAction(a, r.id, "join");
            io.to("actor:" + entry.actor.id).emit("room:state", joined);
            return joined;
          }
        }
        queue.set(a.id, { actor: a, minutes });
        return { searching: true };
      }),
    ),
  );
  app.post(
    "/api/matchmaking/cancel",
    route((_req, res) =>
      queued(async () => {
        queue.delete(actor(res).id);
        return { ok: true };
      }),
    ),
  );
  app.get(
    "/api/matches/history",
    route(async (req, res) =>
      historyRows(user(res).id, user(res).id, false, req.query),
    ),
  );
  app.get(
    "/api/matches/saved",
    route(async (_req, res) =>
      db.match
        .findMany({
          where: {
            OR: [{ red: user(res).id }, { black: user(res).id }],
            status: { in: ["SAVED", "RESUMING"] },
          },
          orderBy: { updatedAt: "desc" },
        })
        .then((ms) =>
          ms.map((m) => ({
            ...(m.state as object),
            createdAt: m.createdAt.toISOString(),
          })),
        ),
    ),
  );
  app.get(
    "/api/matches/current",
    route(async (_req, res) => {
      const a = actor(res),
        m = await db.match.findFirst({
          where: {
            OR: [{ red: a.id }, { black: a.id }],
            status: { in: ["ACTIVE", "PAUSED_RECONNECT", "RESUMING"] },
          },
        });
      return m?.state ?? null;
    }),
  );
  app.get(
    "/api/matches/:id",
    route((req, res) => game.match(id(req), actor(res).id)),
  );
  app.get(
    "/api/matches/:id/replay",
    route(async (req, res) => {
      const a = actor(res),
        row = await db.match.findUnique({ where: { id: id(req) } });
      assert(row, "NOT_FOUND", 404);
      const participant = [row.red, row.black].includes(a.id);
      if (!participant) {
        user(res);
        assert(["FINISHED", "CANCELED"].includes(row.status), "FORBIDDEN", 403);
        const people = await db.user.findMany({
          where: {
            id: { in: [row.red, row.black] },
            status: "ACTIVE",
            deletedAt: null,
            hideHistory: false,
          },
          select: { id: true },
        });
        assert(
          people.length === 2 &&
            !(await game.blocked(a.id, row.red)) &&
            !(await game.blocked(a.id, row.black)),
          "FORBIDDEN",
          403,
        );
      }
      const m = row.state as unknown as MatchState;
      return {
        ...m,
        messages: [],
        receipts: {},
        windows: {},
        requests: [],
        ready: [],
        video: false,
        videoSessionId: undefined,
        serverTime: game.now(),
      };
    }),
  );
  app.get(
    "/api/matches/:id/rtc-config",
    route(async (req, res) => {
      const m = await game.match(id(req), actor(res).id);
      assert(
        m.video &&
          m.status === "ACTIVE" &&
          !(await game.blocked(m.red, m.black)),
        "FORBIDDEN",
        403,
      );
      return {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          ...(process.env.TURN_URL
            ? [
                {
                  urls: process.env.TURN_URL,
                  username: process.env.TURN_USERNAME,
                  credential: process.env.TURN_CREDENTIAL,
                },
              ]
            : []),
        ],
      };
    }),
  );
  app.post(
    "/api/matches/:id/request",
    route((req, res) => {
      const d = z
        .object({
          kind: z.enum(["SAVE", "RESUME", "DRAW", "UNDO", "VIDEO"]),
          requestId: z.uuid(),
        })
        .parse(req.body);
      return game.request(actor(res), id(req), d.kind, d.requestId);
    }),
  );
  app.post(
    "/api/matches/:id/respond",
    route((req, res) => {
      const d = z
        .object({ requestId: z.uuid(), accept: z.boolean() })
        .parse(req.body);
      return game.respond(actor(res), id(req), d.requestId, d.accept);
    }),
  );
  app.post(
    "/api/matches/:id/ready",
    route((req, res) => game.resumeReady(actor(res), id(req))),
  );
  app.post(
    "/api/matches/:id/resign",
    route((req, res) => game.resign(actor(res), id(req))),
  );
  app.post(
    "/api/matches/:id/video-close",
    route((req, res) =>
      game.mutate(actor(res), id(req), (m) => {
        m.video = false;
      }),
    ),
  );
  app.post(
    "/api/reports",
    route((req, res) => {
      const a = user(res),
        d = z
          .object({
            target: z.uuid(),
            text: z.string().trim().min(5).max(1000),
          })
          .parse(req.body);
      return db.report.create({ data: { sender: a.id, ...d } });
    }),
  );
  app.use("/api/admin", (_req, res, next) => {
    try {
      assert(actor(res).role === "ADMIN", "FORBIDDEN", 403);
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get(
    "/api/admin/users",
    route(async (req) => {
      const q = z
        .string()
        .trim()
        .max(120)
        .parse(req.query.q ?? "");
      const rows = await db.user.findMany({
        where: {
          AND: [
            before(req.query),
            ...(q
              ? [
                  {
                    OR: [
                      {
                        username: { contains: q, mode: "insensitive" as const },
                      },
                      {
                        displayName: {
                          contains: q,
                          mode: "insensitive" as const,
                        },
                      },
                      { publicCode: q },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: [...order],
        select: {
          id: true,
          username: true,
          displayName: true,
          status: true,
          role: true,
          createdAt: true,
        },
        take:
          req.query.limit !== undefined ? pagination(req.query).limit + 1 : 100,
      });
      return req.query.limit !== undefined ? page(rows, req.query) : rows;
    }),
  );
  app.get(
    "/api/admin/reports",
    route(async (req) => {
      const q = z
        .string()
        .trim()
        .max(120)
        .parse(req.query.q ?? "");
      const rows = await db.report.findMany({
        where: {
          AND: [
            before(req.query),
            ...(q
              ? [
                  {
                    OR: [
                      { text: { contains: q, mode: "insensitive" as const } },
                      { id: q },
                      { target: q },
                      { sender: q },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: [...order],
        take:
          req.query.limit !== undefined ? pagination(req.query).limit + 1 : 100,
      });
      return req.query.limit !== undefined ? page(rows, req.query) : rows;
    }),
  );
  app.get(
    "/api/admin/audit",
    route(async (req) => {
      const q = z
        .string()
        .trim()
        .max(120)
        .parse(req.query.q ?? "");
      const rows = await db.audit.findMany({
        where: {
          AND: [
            before(req.query),
            ...(q
              ? [
                  {
                    OR: [
                      { action: { contains: q, mode: "insensitive" as const } },
                      { entityId: q },
                      { actor: q },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: [...order],
        take:
          req.query.limit !== undefined ? pagination(req.query).limit + 1 : 100,
      });
      return req.query.limit !== undefined ? page(rows, req.query) : rows;
    }),
  );
  app.get(
    "/api/admin/matches",
    route(async (req) => {
      const filters = z
        .object({
          status: z
            .enum([
              "all",
              "ACTIVE",
              "PAUSED_RECONNECT",
              "SAVED",
              "RESUMING",
              "FINISHED",
              "CANCELED",
            ])
            .default("all"),
          mode: z
            .enum(["all", "PUBLIC", "PRIVATE", "RANDOM", "UNKNOWN"])
            .default("all"),
          player: z.string().trim().max(120).optional(),
          q: z.string().trim().max(120).optional(),
          date: z.iso.date().optional(),
        })
        .parse(req.query);
      const clauses: Prisma.MatchWhereInput[] = [before(req.query)];
      if (filters.status !== "all") clauses.push({ status: filters.status });
      if (filters.mode !== "all") clauses.push({ mode: filters.mode });
      const player = filters.player ?? filters.q;
      if (player)
        clauses.push({
          OR: [
            { id: player },
            { red: player },
            { black: player },
            {
              state: {
                path: ["names", "red"],
                string_contains: player,
                mode: "insensitive",
              },
            },
            {
              state: {
                path: ["names", "black"],
                string_contains: player,
                mode: "insensitive",
              },
            },
          ],
        });
      if (filters.date) {
        const at = new Date(filters.date + "T00:00:00+07:00");
        clauses.push({
          createdAt: { gte: at, lt: new Date(at.getTime() + 86400000) },
        });
      }
      const rows = await db.match.findMany({
        where: { AND: clauses },
        orderBy: [...order],
        take: pagination(req.query).limit + 1,
      });
      return page(rows, req.query, summary);
    }),
  );
  app.get(
    "/api/admin/matches/:id",
    route(async (req, res) => {
      const row = await db.match.findUnique({ where: { id: id(req) } });
      assert(row, "NOT_FOUND", 404);
      const m = row.state as unknown as MatchState;
      await db.audit.create({
        data: {
          actor: actor(res).id,
          action: "ADMIN_VIEW_MATCH",
          entityId: row.id,
        },
      });
      return {
        ...summary(row),
        roomId: m.roomId,
        serverTime: game.now(),
        lastTick: m.lastTick,
        windows: m.windows,
        requests: m.requests.filter((r) => r.status === "PENDING"),
        ready: m.ready,
        video: m.video,
        position: { turn: m.position.turn },
        storedVersion: row.version,
      };
    }),
  );
  app.patch(
    "/api/admin/users/:id/status",
    route(async (req, res) => {
      const status = z
        .enum(["ACTIVE", "BANNED", "DELETED"])
        .parse(req.body.status);
      await game.serial(() =>
        db.$transaction(async (tx) => {
          const target = await tx.user.findUniqueOrThrow({
            where: { id: id(req) },
          });
          assert(
            !target.deletedAt || status === "DELETED",
            "ACCOUNT_UNAVAILABLE",
          );
          await tx.user.update({
            where: { id: id(req) },
            data: {
              status,
              ...(status === "DELETED"
                ? {
                    deletedAt: new Date(),
                    displayName: "Tài khoản đã xóa",
                    hideHistory: true,
                  }
                : {}),
            },
          });
          if (status !== "ACTIVE")
            await tx.session.updateMany({
              where: { userId: id(req) },
              data: { revokedAt: new Date() },
            });
          await tx.audit.create({
            data: {
              actor: actor(res).id,
              action: "ADMIN_" + status,
              entityId: id(req),
            },
          });
          if (status === "DELETED") await game.anonymize(tx, id(req));
        }),
      );
      if (status !== "ACTIVE")
        for (const s of await db.session.findMany({
          where: { userId: id(req) },
        }))
          await auth.onRevoke(s.id);
      return { ok: true };
    }),
  );
  app.patch(
    "/api/admin/reports/:id",
    route(async (req, res) => {
      const status = z
        .enum(["OPEN", "RESOLVED", "DISMISSED"])
        .parse(req.body.status);
      return db.$transaction(async (tx) => {
        await tx.audit.create({
          data: {
            actor: actor(res).id,
            action: "REPORT_" + status,
            entityId: id(req),
          },
        });
        return tx.report.update({ where: { id: id(req) }, data: { status } });
      });
    }),
  );
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
