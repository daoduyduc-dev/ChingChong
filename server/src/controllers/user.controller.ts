import type { Express } from "express";
import { z } from "zod";
import { AuthService } from "../services/auth";
import { GameService } from "../services/game";
import { db } from "../database/db";
import { assert } from "../common/errors";
import { route, user } from "./http";

export function registerUserRoutes(
  app: Express,
  auth: AuthService,
  game: GameService,
) {
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
}
