import type { Express, Request } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { MatchState } from "../../../shared/domain";
import { db } from "../database/db";
import { assert } from "../common/errors";
import { AuthService } from "../services/auth";
import { GameService } from "../services/game";
import {
  before,
  order,
  page,
  pagination,
  summary,
} from "../repositories/browse";
import { actor, route } from "./http";

export function registerAdminRoutes(
  app: Express,
  auth: AuthService,
  game: GameService,
) {
  const id = (req: Request) => String(req.params.id);
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
}
