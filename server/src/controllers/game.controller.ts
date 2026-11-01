import type { Express, Request } from "express";
import { z } from "zod";
import type { Server } from "socket.io";
import type { Actor, MatchState, RoomState } from "../../../shared/domain";
import { db } from "../database/db";
import { assert, DomainError } from "../common/errors";
import { GameService } from "../services/game";
import { historyRows } from "../repositories/browse";
import { actor, route, user } from "./http";

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
export function registerGameRoutes(
  app: Express,
  game: GameService,
  io: Server,
  queue: Map<string, { actor: Actor; minutes: number }>,
) {
  const id = (req: Request) => String(req.params.id);
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
}
