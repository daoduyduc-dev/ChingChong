import type { Express, Request } from "express";
import type { Server } from "socket.io";
import { z } from "zod";
import type { MatchState } from "../../../shared/domain";
import { db } from "../database/db";
import { assert } from "../common/errors";
import { GameService } from "../services/game";
import { actor, route, user } from "./http";

export function registerSocialRoutes(
  app: Express,
  game: GameService,
  io: Server,
) {
  const id = (req: Request) => String(req.params.id);
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
}
