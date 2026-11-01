import type express from "express";
import type { Actor } from "../../../shared/domain";
import { assert } from "../common/errors";

export const route =
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
export const actor = (res: express.Response) => res.locals.actor as Actor;
export const user = (res: express.Response) => {
  const a = actor(res);
  assert(!a.guest, "FORBIDDEN", 403);
  return a;
};
